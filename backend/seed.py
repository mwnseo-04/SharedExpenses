from app import create_app
from app.demo_data import _create_demo_trip
from app.models import db


def seed_database(app=None):
    app = app or create_app()
    with app.app_context():
        db.drop_all()
        db.create_all()
        trip, member_count, expense_count = _create_demo_trip()
        print(f"Seeded {trip.name} with {member_count} members and {expense_count} expenses.")


if __name__ == "__main__":
    seed_database()
