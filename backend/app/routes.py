from datetime import date
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from functools import wraps

from flask import Blueprint, current_app, jsonify, request

from app.models import db, Expense, Member, Trip
from app.services.analytics import build_analytics
from app.services.money import allocate_expense, calculate_balances, calculate_settlements


api = Blueprint("api", __name__, url_prefix="/api")
CATEGORIES = {"Food", "Transportation", "Lodging", "Entertainment", "Shopping", "Other"}


def error(message, status=400):
    return jsonify({"error": message}), status


def require_write_access(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        pin = request.headers.get("X-Access-Pin", "")
        expected = current_app.config.get("ACCESS_PIN", "48291")
        if pin != expected:
            return error("Write access requires a valid PIN.", 403)
        return view(*args, **kwargs)

    return wrapped


def parse_date(value, field):
    try:
        return date.fromisoformat(value)
    except (TypeError, ValueError):
        raise ValueError(f"{field} must be a valid ISO date.")


def parse_money(value, field="amount"):
    try:
        cents = int((Decimal(str(value)) * 100).quantize(Decimal("1"), ROUND_HALF_UP))
    except (InvalidOperation, TypeError, ValueError):
        raise ValueError(f"{field} must be a valid monetary amount.")
    return cents


@api.get("/health")
def health():
    return {"status": "ok"}


@api.post("/auth/unlock")
def unlock():
    data = request.get_json(silent=True) or {}
    pin = str(data.get("pin", "")).strip()
    expected = current_app.config.get("ACCESS_PIN", "48291")
    if len(pin) != 5 or not pin.isdigit():
        return error("Enter a 5-digit PIN.")
    if pin != expected:
        return error("Incorrect PIN.", 401)
    return jsonify({"ok": True, "mode": "edit"})


@api.get("/trips")
def list_trips():
    trips = Trip.query.order_by(Trip.is_demo.desc(), Trip.created_at.desc()).all()
    return jsonify([trip.to_dict() for trip in trips])


@api.post("/trips")
@require_write_access
def create_trip():
    data = request.get_json(silent=True) or {}
    try:
        name = str(data.get("name", "")).strip()
        destination = str(data.get("destination", "")).strip()
        start_date = parse_date(data.get("start_date"), "start_date")
        end_date = parse_date(data.get("end_date"), "end_date")
        budget = parse_money(data.get("total_budget"), "total_budget")
        if not name or not destination:
            raise ValueError("Trip name and destination are required.")
        if end_date < start_date:
            raise ValueError("End date cannot be before start date.")
        if budget <= 0:
            raise ValueError("Budget must be greater than zero.")
    except ValueError as exc:
        return error(str(exc))
    trip = Trip(
        name=name,
        destination=destination,
        start_date=start_date,
        end_date=end_date,
        total_budget_cents=budget,
        is_demo=False,
    )
    db.session.add(trip)
    db.session.commit()
    return jsonify(trip.to_dict(include_details=True)), 201


@api.get("/trips/<int:trip_id>")
def get_trip(trip_id):
    trip = db.get_or_404(Trip, trip_id)
    return jsonify(trip.to_dict(include_details=True))


@api.patch("/trips/<int:trip_id>")
@require_write_access
def update_trip(trip_id):
    trip = db.get_or_404(Trip, trip_id)
    data = request.get_json(silent=True) or {}
    try:
        name = str(data.get("name", trip.name)).strip()
        destination = str(data.get("destination", trip.destination)).strip()
        start_date = parse_date(data.get("start_date", trip.start_date.isoformat()), "start_date")
        end_date = parse_date(data.get("end_date", trip.end_date.isoformat()), "end_date")
        if "total_budget" in data:
            budget = parse_money(data.get("total_budget"), "total_budget")
        else:
            budget = trip.total_budget_cents
        if not name or not destination:
            raise ValueError("Trip name and destination are required.")
        if end_date < start_date:
            raise ValueError("End date cannot be before start date.")
        if budget <= 0:
            raise ValueError("Budget must be greater than zero.")
    except ValueError as exc:
        return error(str(exc))

    trip.name = name
    trip.destination = destination
    trip.start_date = start_date
    trip.end_date = end_date
    trip.total_budget_cents = budget
    db.session.commit()
    return jsonify(trip.to_dict(include_details=True))


@api.delete("/trips/<int:trip_id>")
@require_write_access
def delete_trip(trip_id):
    trip = db.get_or_404(Trip, trip_id)
    db.session.delete(trip)
    db.session.commit()
    return "", 204


@api.get("/trips/<int:trip_id>/members")
def list_members(trip_id):
    trip = db.get_or_404(Trip, trip_id)
    return jsonify([member.to_dict() for member in trip.members])


@api.post("/trips/<int:trip_id>/members")
@require_write_access
def create_member(trip_id):
    trip = db.get_or_404(Trip, trip_id)
    data = request.get_json(silent=True) or {}
    name = str(data.get("name", "")).strip()
    if not name:
        return error("Member name is required.")
    if any(member.name.casefold() == name.casefold() for member in trip.members):
        return error("A member with that name already exists.")
    member = Member(trip=trip, name=name)
    db.session.add(member)
    db.session.commit()
    return jsonify(member.to_dict()), 201


@api.delete("/members/<int:member_id>")
@require_write_access
def delete_member(member_id):
    member = db.get_or_404(Member, member_id)
    if member.paid_expenses or member.participations:
        return error("Members attached to expenses cannot be deleted.", 409)
    db.session.delete(member)
    db.session.commit()
    return "", 204


@api.get("/trips/<int:trip_id>/expenses")
def list_expenses(trip_id):
    trip = db.get_or_404(Trip, trip_id)
    expenses = sorted(trip.expenses, key=lambda item: (item.date, item.created_at), reverse=True)
    return jsonify([expense.to_dict() for expense in expenses])


@api.post("/trips/<int:trip_id>/expenses")
@require_write_access
def create_expense(trip_id):
    trip = db.get_or_404(Trip, trip_id)
    data = request.get_json(silent=True) or {}
    try:
        description = str(data.get("description", "")).strip()
        amount_cents = parse_money(data.get("amount"))
        category = data.get("category")
        expense_date = parse_date(data.get("date"), "date")
        payer_id = int(data.get("paid_by_member_id"))
        participant_ids = [int(value) for value in data.get("participant_ids", [])]
        member_ids = {member.id for member in trip.members}
        if not description:
            raise ValueError("Description is required.")
        if amount_cents <= 0:
            raise ValueError("Amount must be greater than zero.")
        if category not in CATEGORIES:
            raise ValueError("Choose a supported category.")
        if payer_id not in member_ids:
            raise ValueError("Payer must belong to this trip.")
        if not participant_ids:
            raise ValueError("Select at least one participant.")
        if len(set(participant_ids)) != len(participant_ids):
            raise ValueError("Participants must be unique.")
        if any(member_id not in member_ids for member_id in participant_ids):
            raise ValueError("All participants must belong to this trip.")
    except (TypeError, ValueError) as exc:
        return error(str(exc))

    expense = Expense(
        trip=trip,
        paid_by_member_id=payer_id,
        description=description,
        amount_cents=amount_cents,
        category=category,
        date=expense_date,
    )
    allocate_expense(expense, participant_ids)
    db.session.add(expense)
    db.session.commit()
    return jsonify(expense.to_dict()), 201


@api.delete("/expenses/<int:expense_id>")
@require_write_access
def delete_expense(expense_id):
    expense = db.get_or_404(Expense, expense_id)
    db.session.delete(expense)
    db.session.commit()
    return "", 204


@api.get("/trips/<int:trip_id>/balances")
def get_balances(trip_id):
    trip = db.get_or_404(Trip, trip_id)
    return jsonify(calculate_balances(trip.members, trip.expenses))


@api.get("/trips/<int:trip_id>/settlements")
def get_settlements(trip_id):
    trip = db.get_or_404(Trip, trip_id)
    balances = calculate_balances(trip.members, trip.expenses)
    transfers = calculate_settlements(balances)
    return jsonify({"payment_count": len(transfers), "transfers": transfers})


@api.get("/trips/<int:trip_id>/analytics")
def get_analytics(trip_id):
    trip = db.get_or_404(Trip, trip_id)
    try:
        return jsonify(build_analytics(trip))
    except Exception:
        current_app.logger.exception("Analytics failed for trip %s", trip_id)
        return error("Analytics temporarily unavailable.", 503)
