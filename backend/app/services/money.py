from collections.abc import Iterable

from app.models import Expense, ExpenseParticipant, Member


def split_cents(amount_cents: int, member_ids: Iterable[int]) -> list[tuple[int, int]]:
    """Split cents exactly; earlier member IDs receive deterministic remainder cents."""
    ids = sorted(set(member_ids))
    if amount_cents <= 0:
        raise ValueError("Amount must be greater than zero.")
    if not ids:
        raise ValueError("At least one participant is required.")
    base, remainder = divmod(amount_cents, len(ids))
    return [
        (member_id, base + (1 if index < remainder else 0))
        for index, member_id in enumerate(ids)
    ]


def allocate_expense(expense: Expense, participant_ids: Iterable[int]) -> None:
    expense.participants = [
        ExpenseParticipant(member_id=member_id, share_cents=share)
        for member_id, share in split_cents(expense.amount_cents, participant_ids)
    ]


def calculate_balances(members: Iterable[Member], expenses: Iterable[Expense]) -> list[dict]:
    balances = {
        member.id: {
            "member_id": member.id,
            "name": member.name,
            "paid_cents": 0,
            "share_cents": 0,
            "net_cents": 0,
        }
        for member in members
    }
    for expense in expenses:
        balances[expense.paid_by_member_id]["paid_cents"] += expense.amount_cents
        for participant in expense.participants:
            balances[participant.member_id]["share_cents"] += participant.share_cents

    for balance in balances.values():
        balance["net_cents"] = balance["paid_cents"] - balance["share_cents"]

    result = sorted(balances.values(), key=lambda row: (-row["net_cents"], row["name"]))
    if sum(row["net_cents"] for row in result) != 0:
        raise ValueError("Balances do not net to zero.")
    return result


def calculate_settlements(balances: Iterable[dict]) -> list[dict]:
    creditors = [
        [row["member_id"], row["name"], row["net_cents"]]
        for row in balances
        if row["net_cents"] > 0
    ]
    debtors = [
        [row["member_id"], row["name"], -row["net_cents"]]
        for row in balances
        if row["net_cents"] < 0
    ]
    creditors.sort(key=lambda row: (-row[2], row[0]))
    debtors.sort(key=lambda row: (-row[2], row[0]))

    transfers = []
    creditor_index = debtor_index = 0
    while creditor_index < len(creditors) and debtor_index < len(debtors):
        creditor = creditors[creditor_index]
        debtor = debtors[debtor_index]
        amount = min(creditor[2], debtor[2])
        transfers.append(
            {
                "from_member_id": debtor[0],
                "from_name": debtor[1],
                "to_member_id": creditor[0],
                "to_name": creditor[1],
                "amount_cents": amount,
            }
        )
        creditor[2] -= amount
        debtor[2] -= amount
        if creditor[2] == 0:
            creditor_index += 1
        if debtor[2] == 0:
            debtor_index += 1

    if any(row[2] for row in creditors) or any(row[2] for row in debtors):
        raise ValueError("Settlements could not fully resolve balances.")
    return transfers
