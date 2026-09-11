from datetime import date

import pandas as pd


def build_analytics(trip, today: date | None = None) -> dict:
    today = today or date.today()
    total_days = max((trip.end_date - trip.start_date).days + 1, 1)
    current_spend = sum(expense.amount_cents for expense in trip.expenses)

    if today < trip.start_date:
        status = "upcoming"
        elapsed_days = 0
        remaining_days = total_days
    elif today > trip.end_date:
        status = "completed"
        elapsed_days = total_days
        remaining_days = 0
    else:
        status = "active"
        elapsed_days = min((today - trip.start_date).days + 1, total_days)
        remaining_days = max(total_days - elapsed_days, 0)

    trip_progress = elapsed_days / total_days
    expected_spend = round(trip.total_budget_cents * trip_progress)
    average_daily = round(current_spend / elapsed_days) if elapsed_days else 0
    forecast = (
        current_spend
        if status != "active"
        else current_spend + average_daily * remaining_days
    )

    rows = [
        {
            "date": expense.date,
            "category": expense.category,
            "amount_cents": expense.amount_cents,
        }
        for expense in trip.expenses
    ]
    frame = pd.DataFrame(rows, columns=["date", "category", "amount_cents"])
    if frame.empty:
        categories = []
        days = []
        expense_average = 0
    else:
        frame["date"] = pd.to_datetime(frame["date"])
        categories = (
            frame.groupby("category", as_index=False)["amount_cents"]
            .sum()
            .sort_values("amount_cents", ascending=False)
        )
        categories = [
            {"category": row["category"], "amount_cents": int(row["amount_cents"])}
            for row in categories.to_dict("records")
        ]
        frame["day"] = frame["date"].dt.date
        daily = (
            frame.groupby("day", as_index=False)["amount_cents"]
            .sum()
            .sort_values("day")
        )
        days = [
            {"date": row["day"].isoformat(), "amount_cents": int(row["amount_cents"])}
            for row in daily.to_dict("records")
        ]
        expense_average = round(float(frame["amount_cents"].mean()))

    budget_used_percentage = (
        current_spend / trip.total_budget_cents * 100 if trip.total_budget_cents else 0
    )
    trip_progress_percentage = trip_progress * 100
    pace_percentage_points = budget_used_percentage - trip_progress_percentage
    target_daily = (
        max(trip.total_budget_cents - current_spend, 0) // remaining_days
        if remaining_days
        else 0
    )

    return {
        "status": status,
        "total_days": total_days,
        "elapsed_days": elapsed_days,
        "remaining_days": remaining_days,
        "trip_progress_percentage": round(trip_progress_percentage, 1),
        "budget_used_percentage": round(budget_used_percentage, 1),
        "current_spend_cents": current_spend,
        "budget_remaining_cents": trip.total_budget_cents - current_spend,
        "expected_spend_to_date_cents": expected_spend,
        "spending_pace_difference_cents": current_spend - expected_spend,
        "pace_percentage_points": round(pace_percentage_points, 1),
        "average_daily_spend_cents": average_daily,
        "average_expense_cents": expense_average,
        "forecasted_final_cost_cents": forecast,
        "projected_budget_difference_cents": trip.total_budget_cents - forecast,
        "target_remaining_daily_spend_cents": target_daily,
        "spending_by_category": categories,
        "spending_by_day": days,
    }
