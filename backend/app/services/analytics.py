from collections import defaultdict
from datetime import date
import os

import pandas as pd


def _analyze_with_pandas(rows):
    frame = pd.DataFrame(rows, columns=["date", "category", "amount_cents"])
    if frame.empty:
        return [], [], 0

    frame["date"] = pd.to_datetime(frame["date"], errors="coerce")
    frame["amount_cents"] = pd.to_numeric(frame["amount_cents"], errors="coerce").fillna(0).astype(int)

    category_totals = (
        frame.groupby("category", as_index=False)["amount_cents"]
        .sum()
        .sort_values("amount_cents", ascending=False)
    )
    categories = [
        {"category": str(row.category), "amount_cents": int(row.amount_cents)}
        for row in category_totals.itertuples(index=False)
    ]

    frame["day"] = frame["date"].dt.strftime("%Y-%m-%d")
    daily_totals = (
        frame.groupby("day", as_index=False)["amount_cents"]
        .sum()
        .sort_values("day")
    )
    days = [
        {"date": str(row.day), "amount_cents": int(row.amount_cents)}
        for row in daily_totals.itertuples(index=False)
    ]
    expense_average = int(round(float(frame["amount_cents"].mean())))
    return categories, days, expense_average


def _analyze_with_python(rows):
    if not rows:
        return [], [], 0

    by_category = defaultdict(int)
    by_day = defaultdict(int)
    total = 0
    for row in rows:
        amount = int(row["amount_cents"])
        by_category[row["category"]] += amount
        by_day[row["date"]] += amount
        total += amount

    categories = [
        {"category": category, "amount_cents": amount}
        for category, amount in sorted(by_category.items(), key=lambda item: item[1], reverse=True)
    ]
    days = [
        {"date": day, "amount_cents": amount}
        for day, amount in sorted(by_day.items())
    ]
    expense_average = int(round(total / len(rows)))
    return categories, days, expense_average


def _expense_breakdown(rows):
    # Free Render memory is tight; pandas is used locally/tests and when explicitly enabled.
    force_pandas = os.environ.get("USE_PANDAS") == "1"
    on_render = bool(os.environ.get("RENDER"))
    if force_pandas or not on_render:
        try:
            return _analyze_with_pandas(rows)
        except Exception:
            return _analyze_with_python(rows)
    return _analyze_with_python(rows)


def build_analytics(trip, today: date | None = None) -> dict:
    today = today or date.today()
    total_days = max((trip.end_date - trip.start_date).days + 1, 1)
    current_spend = int(sum(expense.amount_cents for expense in trip.expenses))

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
    expected_spend = int(round(trip.total_budget_cents * trip_progress))
    average_daily = int(round(current_spend / elapsed_days)) if elapsed_days else 0
    forecast = (
        current_spend
        if status != "active"
        else current_spend + average_daily * remaining_days
    )

    rows = [
        {
            "date": expense.date.isoformat(),
            "category": expense.category,
            "amount_cents": int(expense.amount_cents),
        }
        for expense in trip.expenses
    ]
    categories, days, expense_average = _expense_breakdown(rows)

    budget_used_percentage = (
        current_spend / trip.total_budget_cents * 100 if trip.total_budget_cents else 0.0
    )
    trip_progress_percentage = trip_progress * 100
    pace_percentage_points = budget_used_percentage - trip_progress_percentage
    target_daily = (
        int(max(trip.total_budget_cents - current_spend, 0) // remaining_days)
        if remaining_days
        else 0
    )

    return {
        "status": status,
        "total_days": int(total_days),
        "elapsed_days": int(elapsed_days),
        "remaining_days": int(remaining_days),
        "trip_progress_percentage": float(round(trip_progress_percentage, 1)),
        "budget_used_percentage": float(round(budget_used_percentage, 1)),
        "current_spend_cents": current_spend,
        "budget_remaining_cents": int(trip.total_budget_cents - current_spend),
        "expected_spend_to_date_cents": expected_spend,
        "spending_pace_difference_cents": int(current_spend - expected_spend),
        "pace_percentage_points": float(round(pace_percentage_points, 1)),
        "average_daily_spend_cents": average_daily,
        "average_expense_cents": expense_average,
        "forecasted_final_cost_cents": int(forecast),
        "projected_budget_difference_cents": int(trip.total_budget_cents - forecast),
        "target_remaining_daily_spend_cents": target_daily,
        "spending_by_category": categories,
        "spending_by_day": days,
    }
