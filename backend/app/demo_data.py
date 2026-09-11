from datetime import date, timedelta

from app.models import db, Expense, Member, Trip
from app.services.money import allocate_expense


def _create_demo_trip():
    today = date.today()
    trip = Trip(
        name="New York Weekend",
        destination="New York City",
        start_date=today - timedelta(days=3),
        end_date=today + timedelta(days=3),
        total_budget_cents=200_000,
        is_demo=True,
    )
    db.session.add(trip)
    names = ["Minseo", "Alex", "Sarah", "Daniel"]
    members = {name: Member(trip=trip, name=name) for name in names}
    db.session.add_all(members.values())
    db.session.flush()

    expense_data = [
        ("The Jane Hotel", 38_000, "Lodging", -3, "Minseo", names),
        ("Airport rideshare", 6_800, "Transportation", -3, "Daniel", names),
        ("Joe's Pizza", 5_420, "Food", -3, "Alex", ["Minseo", "Alex", "Sarah"]),
        ("Blue Bottle coffee", 2_460, "Food", -2, "Sarah", names),
        ("Metro cards", 2_320, "Transportation", -2, "Minseo", names),
        ("MoMA tickets", 10_000, "Entertainment", -2, "Daniel", ["Alex", "Sarah"]),
        ("West Village dinner", 16_280, "Food", -2, "Minseo", names),
        ("Broadway tickets", 18_000, "Entertainment", -1, "Sarah", ["Minseo", "Sarah", "Daniel"]),
        ("Sunday breakfast", 5_640, "Food", -1, "Alex", names),
        ("Convenience store", 3_180, "Other", -1, "Daniel", ["Alex", "Daniel"]),
        ("SoHo souvenirs", 7_550, "Shopping", 0, "Sarah", ["Sarah", "Daniel"]),
        ("High Line lunch", 6_920, "Food", 0, "Minseo", names),
        ("Chelsea Market snacks", 2_880, "Food", 0, "Alex", ["Alex", "Sarah", "Daniel"]),
        ("Late-night rideshare", 3_740, "Transportation", 0, "Daniel", names),
        ("Bagel breakfast", 3_260, "Food", 0, "Minseo", ["Minseo", "Alex", "Sarah"]),
    ]
    for description, amount, category, offset, payer, participants in expense_data:
        expense = Expense(
            trip=trip,
            paid_by_member_id=members[payer].id,
            description=description,
            amount_cents=amount,
            category=category,
            date=today + timedelta(days=offset),
        )
        allocate_expense(expense, [members[name].id for name in participants])
        db.session.add(expense)

    db.session.commit()
    return trip, len(names), len(expense_data)


def ensure_demo_data():
    """Load the demo trip only when the database is empty."""
    if Trip.query.count() > 0:
        return False
    trip, member_count, expense_count = _create_demo_trip()
    print(f"Auto-seeded {trip.name} with {member_count} members and {expense_count} expenses.")
    return True
