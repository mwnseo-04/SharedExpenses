from datetime import date, timedelta
from types import SimpleNamespace

import pytest

from app import create_app
from app.models import db, Expense, Member, Trip
from app.services.analytics import build_analytics
from app.services.money import (
    allocate_expense,
    calculate_balances,
    calculate_settlements,
    split_cents,
)


@pytest.fixture()
def app():
    application = create_app(
        {
            "TESTING": True,
            "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
        }
    )
    with application.app_context():
        db.drop_all()
        db.create_all()
        yield application
        db.session.remove()


def make_trip():
    today = date.today()
    trip = Trip(
        name="Test Trip",
        destination="Test City",
        start_date=today - timedelta(days=1),
        end_date=today + timedelta(days=2),
        total_budget_cents=100_000,
    )
    db.session.add(trip)
    members = [Member(trip=trip, name=name) for name in ("A", "B", "C")]
    db.session.add_all(members)
    db.session.flush()
    return trip, members


def add_expense(trip, payer, participants, amount=10_000):
    expense = Expense(
        trip=trip,
        paid_by_member_id=payer.id,
        description="Shared cost",
        amount_cents=amount,
        category="Food",
        date=date.today(),
    )
    allocate_expense(expense, [member.id for member in participants])
    db.session.add(expense)
    db.session.flush()
    return expense


def test_exact_equal_split():
    assert split_cents(9_000, [1, 2, 3]) == [(1, 3_000), (2, 3_000), (3, 3_000)]


def test_split_with_remainder_cents():
    shares = split_cents(10_000, [1, 2, 3])
    assert shares == [(1, 3_334), (2, 3_333), (3, 3_333)]
    assert sum(share for _, share in shares) == 10_000


def test_selective_participation(app):
    trip, members = make_trip()
    expense = add_expense(trip, members[0], members[1:], 6_000)
    assert {item.member_id for item in expense.participants} == {members[1].id, members[2].id}


def test_payer_participates(app):
    trip, members = make_trip()
    add_expense(trip, members[0], members, 9_000)
    balances = calculate_balances(trip.members, trip.expenses)
    assert next(row for row in balances if row["member_id"] == members[0].id)["net_cents"] == 6_000


def test_payer_does_not_participate(app):
    trip, members = make_trip()
    add_expense(trip, members[0], members[1:], 6_000)
    balances = {row["name"]: row for row in calculate_balances(trip.members, trip.expenses)}
    assert balances["A"]["net_cents"] == 6_000
    assert balances["B"]["net_cents"] == -3_000
    assert balances["C"]["net_cents"] == -3_000


def test_member_balance_calculation(app):
    trip, members = make_trip()
    add_expense(trip, members[0], members, 9_000)
    add_expense(trip, members[1], members[1:], 4_000)
    balances = {row["name"]: row for row in calculate_balances(trip.members, trip.expenses)}
    assert balances["A"] == {
        "member_id": members[0].id,
        "name": "A",
        "paid_cents": 9_000,
        "share_cents": 3_000,
        "net_cents": 6_000,
    }


def test_balances_sum_exactly_to_zero(app):
    trip, members = make_trip()
    add_expense(trip, members[2], members, 10_001)
    assert sum(row["net_cents"] for row in calculate_balances(trip.members, trip.expenses)) == 0


def test_debtor_creditor_settlement():
    balances = [
        {"member_id": 1, "name": "Minseo", "net_cents": 15_000},
        {"member_id": 2, "name": "Alex", "net_cents": -7_500},
        {"member_id": 3, "name": "Sarah", "net_cents": -7_500},
    ]
    transfers = calculate_settlements(balances)
    assert len(transfers) == 2
    assert sum(item["amount_cents"] for item in transfers) == 15_000


def test_settlements_fully_resolve_balances():
    balances = [
        {"member_id": 1, "name": "A", "net_cents": 5_001},
        {"member_id": 2, "name": "B", "net_cents": 1_999},
        {"member_id": 3, "name": "C", "net_cents": -3_500},
        {"member_id": 4, "name": "D", "net_cents": -3_500},
    ]
    remaining = {row["member_id"]: row["net_cents"] for row in balances}
    for transfer in calculate_settlements(balances):
        remaining[transfer["from_member_id"]] += transfer["amount_cents"]
        remaining[transfer["to_member_id"]] -= transfer["amount_cents"]
    assert set(remaining.values()) == {0}


def analytics_trip(start, end, expenses=None, budget=100_000):
    return SimpleNamespace(
        start_date=start,
        end_date=end,
        expenses=expenses or [],
        total_budget_cents=budget,
    )


def expense(amount, day, category="Food"):
    return SimpleNamespace(amount_cents=amount, date=day, category=category)


def test_no_expense_trip():
    today = date(2026, 5, 5)
    result = build_analytics(analytics_trip(today, today + timedelta(days=2)), today)
    assert result["current_spend_cents"] == 0
    assert result["spending_by_category"] == []


def test_completed_trip_forecasting():
    start = date(2026, 4, 1)
    trip = analytics_trip(start, start + timedelta(days=2), [expense(25_000, start)])
    result = build_analytics(trip, date(2026, 5, 1))
    assert result["status"] == "completed"
    assert result["forecasted_final_cost_cents"] == 25_000
    assert result["remaining_days"] == 0


def test_active_trip_forecasting():
    today = date(2026, 5, 2)
    trip = analytics_trip(
        date(2026, 5, 1),
        date(2026, 5, 4),
        [expense(20_000, date(2026, 5, 1))],
    )
    result = build_analytics(trip, today)
    assert result["average_daily_spend_cents"] == 10_000
    assert result["forecasted_final_cost_cents"] == 40_000


def test_future_trip_forecasting():
    today = date(2026, 5, 1)
    trip = analytics_trip(
        date(2026, 5, 10),
        date(2026, 5, 12),
        [expense(4_200, date(2026, 4, 28))],
    )
    result = build_analytics(trip, today)
    assert result["status"] == "upcoming"
    assert result["elapsed_days"] == 0
    assert result["forecasted_final_cost_cents"] == 4_200


def test_update_trip_details(app):
    trip, _members = make_trip()
    db.session.commit()
    client = app.test_client()
    headers = {"X-Access-Pin": app.config["ACCESS_PIN"]}
    response = client.patch(
        f"/api/trips/{trip.id}",
        headers=headers,
        json={
            "name": "Updated Trip",
            "destination": "Updated City",
            "start_date": trip.start_date.isoformat(),
            "end_date": (trip.end_date + timedelta(days=2)).isoformat(),
            "total_budget": 1500,
        },
    )
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["name"] == "Updated Trip"
    assert payload["destination"] == "Updated City"
    assert payload["total_budget_cents"] == 150_000
    trip, members = make_trip()
    expense_record = add_expense(trip, members[0], members, 9_000)
    db.session.commit()
    client = app.test_client()
    headers = {"X-Access-Pin": app.config["ACCESS_PIN"]}
    assert client.delete(f"/api/expenses/{expense_record.id}", headers=headers).status_code == 204
    result = client.get(f"/api/trips/{trip.id}/balances").get_json()
    assert all(row["net_cents"] == 0 for row in result)
