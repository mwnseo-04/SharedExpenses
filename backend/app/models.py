from datetime import datetime, timezone

from flask_sqlalchemy import SQLAlchemy


db = SQLAlchemy()


def utc_now():
    return datetime.now(timezone.utc)


class Trip(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    destination = db.Column(db.String(120), nullable=False)
    start_date = db.Column(db.Date, nullable=False)
    end_date = db.Column(db.Date, nullable=False)
    total_budget_cents = db.Column(db.Integer, nullable=False)
    is_demo = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime(timezone=True), default=utc_now, nullable=False)

    members = db.relationship(
        "Member", back_populates="trip", cascade="all, delete-orphan", lazy=True
    )
    expenses = db.relationship(
        "Expense", back_populates="trip", cascade="all, delete-orphan", lazy=True
    )

    def to_dict(self, include_details=False):
        spent = sum(expense.amount_cents for expense in self.expenses)
        data = {
            "id": self.id,
            "name": self.name,
            "destination": self.destination,
            "start_date": self.start_date.isoformat(),
            "end_date": self.end_date.isoformat(),
            "total_budget_cents": self.total_budget_cents,
            "spent_cents": spent,
            "remaining_cents": self.total_budget_cents - spent,
            "member_count": len(self.members),
            "is_demo": bool(self.is_demo),
            "created_at": self.created_at.isoformat(),
        }
        if include_details:
            data["members"] = [member.to_dict() for member in self.members]
            data["expenses"] = [
                expense.to_dict() for expense in sorted(
                    self.expenses, key=lambda item: (item.date, item.created_at), reverse=True
                )
            ]
        return data


class Member(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    trip_id = db.Column(
        db.Integer, db.ForeignKey("trip.id", ondelete="CASCADE"), nullable=False
    )
    name = db.Column(db.String(80), nullable=False)

    trip = db.relationship("Trip", back_populates="members")
    paid_expenses = db.relationship("Expense", back_populates="payer", lazy=True)
    participations = db.relationship(
        "ExpenseParticipant",
        back_populates="member",
        cascade="all, delete-orphan",
        lazy=True,
    )

    def to_dict(self):
        return {"id": self.id, "trip_id": self.trip_id, "name": self.name}


class Expense(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    trip_id = db.Column(
        db.Integer, db.ForeignKey("trip.id", ondelete="CASCADE"), nullable=False
    )
    paid_by_member_id = db.Column(
        db.Integer, db.ForeignKey("member.id"), nullable=False
    )
    description = db.Column(db.String(160), nullable=False)
    amount_cents = db.Column(db.Integer, nullable=False)
    category = db.Column(db.String(30), nullable=False)
    date = db.Column(db.Date, nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), default=utc_now, nullable=False)

    trip = db.relationship("Trip", back_populates="expenses")
    payer = db.relationship("Member", back_populates="paid_expenses")
    participants = db.relationship(
        "ExpenseParticipant",
        back_populates="expense",
        cascade="all, delete-orphan",
        lazy=True,
    )

    def to_dict(self):
        return {
            "id": self.id,
            "trip_id": self.trip_id,
            "description": self.description,
            "amount_cents": self.amount_cents,
            "category": self.category,
            "date": self.date.isoformat(),
            "created_at": self.created_at.isoformat(),
            "payer": self.payer.to_dict(),
            "participants": [
                participant.to_dict()
                for participant in sorted(self.participants, key=lambda item: item.id)
            ],
        }


class ExpenseParticipant(db.Model):
    __table_args__ = (
        db.UniqueConstraint("expense_id", "member_id", name="uq_expense_member"),
    )

    id = db.Column(db.Integer, primary_key=True)
    expense_id = db.Column(
        db.Integer, db.ForeignKey("expense.id", ondelete="CASCADE"), nullable=False
    )
    member_id = db.Column(
        db.Integer, db.ForeignKey("member.id", ondelete="CASCADE"), nullable=False
    )
    share_cents = db.Column(db.Integer, nullable=False)

    expense = db.relationship("Expense", back_populates="participants")
    member = db.relationship("Member", back_populates="participations")

    def to_dict(self):
        return {
            "id": self.id,
            "member": self.member.to_dict(),
            "share_cents": self.share_cents,
        }
