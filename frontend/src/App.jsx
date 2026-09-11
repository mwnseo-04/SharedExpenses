import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Avatar,
  CategoryChart,
  DailyChart,
  EmptyState,
  ExpenseRow,
  Modal,
  TripCard,
  TripPace,
} from './components'
import { api, clearAccessMode, getAccessMode, setAccessMode } from './api'
import { categories, dateRange, money, todayIso } from './utils'
import './App.css'

const tabs = [
  { id: 'overview', label: 'Overview' },
  { id: 'expenses', label: 'Expenses' },
  { id: 'settle', label: 'Settle Up' },
  { id: 'insights', label: 'Insights' },
]

function App() {
  const [access, setAccess] = useState(() => getAccessMode())
  const [trips, setTrips] = useState([])
  const [selectedTripId, setSelectedTripId] = useState(null)
  const [trip, setTrip] = useState(null)
  const [balances, setBalances] = useState([])
  const [settlements, setSettlements] = useState({ payment_count: 0, transfers: [] })
  const [analytics, setAnalytics] = useState(null)
  const [tab, setTab] = useState('overview')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [showCreateTrip, setShowCreateTrip] = useState(false)
  const [showExpense, setShowExpense] = useState(false)
  const [showMember, setShowMember] = useState(false)

  const canEdit = access?.mode === 'edit'

  const loadTrips = useCallback(async (preferredId = null) => {
    const data = await api.trips()
    setTrips(data)
    if (!data.length) {
      setSelectedTripId(null)
      setTrip(null)
      return
    }
    const demo = data.find((item) => item.is_demo)
    const nextId = preferredId && data.some((item) => item.id === preferredId)
      ? preferredId
      : selectedTripId && data.some((item) => item.id === selectedTripId)
        ? selectedTripId
        : demo?.id || data[0].id
    setSelectedTripId(nextId)
  }, [selectedTripId])

  const loadTripDetails = useCallback(async (tripId) => {
    if (!tripId) return
    const [tripData, balanceData, settlementData] = await Promise.all([
      api.trip(tripId),
      api.balances(tripId),
      api.settlements(tripId),
    ])
    setTrip(tripData)
    setBalances(balanceData)
    setSettlements(settlementData)

    try {
      const analyticsData = await api.analytics(tripId)
      setAnalytics(analyticsData)
    } catch {
      setAnalytics(null)
    }
  }, [])

  useEffect(() => {
    if (!access) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError('')
      try {
        await loadTrips()
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [access])

  useEffect(() => {
    if (!access || !selectedTripId) return
    let cancelled = false
    ;(async () => {
      setBusy(true)
      setError('')
      try {
        await loadTripDetails(selectedTripId)
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setBusy(false)
      }
    })()
    return () => { cancelled = true }
  }, [access, selectedTripId, loadTripDetails])

  const filteredExpenses = useMemo(() => {
    if (!trip) return []
    if (categoryFilter === 'All') return trip.expenses
    return trip.expenses.filter((expense) => expense.category === categoryFilter)
  }, [trip, categoryFilter])

  function enterAsGuest() {
    setAccessMode('guest')
    setAccess({ mode: 'guest', pin: '' })
  }

  async function enterWithPin(pin) {
    await api.unlock(pin)
    setAccessMode('edit', pin)
    setAccess({ mode: 'edit', pin })
  }

  function handleLock() {
    clearAccessMode()
    setAccess(null)
    setTrips([])
    setTrip(null)
    setSelectedTripId(null)
    setError('')
  }

  async function refreshAll(preferredId = selectedTripId) {
    await loadTrips(preferredId)
    if (preferredId) await loadTripDetails(preferredId)
  }

  async function handleCreateTrip(payload) {
    setBusy(true)
    setError('')
    try {
      const created = await api.createTrip(payload)
      setShowCreateTrip(false)
      setSelectedTripId(created.id)
      setTab('overview')
      await refreshAll(created.id)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleDeleteTrip(tripId) {
    if (!window.confirm('Delete this trip and all of its expenses?')) return
    setBusy(true)
    setError('')
    try {
      await api.deleteTrip(tripId)
      const next = trips.filter((item) => item.id !== tripId)
      setTrips(next)
      const nextId = next[0]?.id || null
      setSelectedTripId(nextId)
      if (!nextId) {
        setTrip(null)
        setBalances([])
        setSettlements({ payment_count: 0, transfers: [] })
        setAnalytics(null)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleAddMember(name) {
    setBusy(true)
    setError('')
    try {
      await api.addMember(selectedTripId, name)
      setShowMember(false)
      await loadTripDetails(selectedTripId)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleAddExpense(payload) {
    setBusy(true)
    setError('')
    try {
      await api.addExpense(selectedTripId, payload)
      setShowExpense(false)
      await loadTripDetails(selectedTripId)
      await loadTrips(selectedTripId)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleDeleteExpense(expense) {
    if (!window.confirm(`Delete “${expense.description}”?`)) return
    setBusy(true)
    setError('')
    try {
      await api.deleteExpense(expense.id)
      await loadTripDetails(selectedTripId)
      await loadTrips(selectedTripId)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (!access) {
    return <AccessGate onGuest={enterAsGuest} onUnlock={enterWithPin} />
  }

  if (loading) {
    return <div className="boot">Loading SharedExpenses…</div>
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">SE</span>
          <div>
            <strong>SharedExpenses</strong>
          </div>
        </div>
        <div className="topbar-actions">
          <span className={`mode-chip ${canEdit ? 'mode-edit' : 'mode-guest'}`}>
            {canEdit ? 'Edit mode' : 'Guest view'}
          </span>
          <label className="trip-switch">
            <span className="sr-only">Current trip</span>
            <select
              value={selectedTripId || ''}
              onChange={(event) => {
                setSelectedTripId(Number(event.target.value))
                setTab('overview')
              }}
              disabled={!trips.length}
            >
              {!trips.length && <option value="">No trips yet</option>}
              {trips.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.is_demo ? `${item.name} (Demo)` : item.name}
                </option>
              ))}
            </select>
          </label>
          {canEdit && (
            <button className="button secondary" type="button" onClick={() => setShowCreateTrip(true)}>New trip</button>
          )}
          {canEdit && trip && (
            <button className="button" type="button" onClick={() => setShowExpense(true)} disabled={!trip.members.length}>
              Add expense
            </button>
          )}
          <button className="button secondary" type="button" onClick={handleLock}>
            {canEdit ? 'Lock' : 'Exit'}
          </button>
        </div>
      </header>

      {error && <div className="banner" role="alert">{error}</div>}
      {!canEdit && (
        <div className="banner banner-info" role="status">
          Guest view is read-only. Enter the PIN to add or edit trips and expenses.
        </div>
      )}

      {!trip ? (
        <main className="page">
          <EmptyState title="No trips yet">
            {canEdit
              ? 'Create a trip to start tracking shared spending, settlements, and budget pace.'
              : 'No trips are available to preview yet.'}
          </EmptyState>
          {canEdit && (
            <div className="centered-actions">
              <button className="button" type="button" onClick={() => setShowCreateTrip(true)}>Create your first trip</button>
            </div>
          )}
        </main>
      ) : (
        <>
          <div className="trip-hero">
            <div>
              <p className="eyebrow">
                {trip.destination}
                {trip.is_demo && <span className="demo-badge">Demo</span>}
              </p>
              <h1>{trip.name}</h1>
              <p className="hero-meta">{dateRange(trip.start_date, trip.end_date)} · {trip.members.length} travelers</p>
            </div>
            <div className="hero-stats">
              <div>
                <span>Spent</span>
                <strong>{money(trip.spent_cents)}</strong>
              </div>
              <div>
                <span>Budget</span>
                <strong>{money(trip.total_budget_cents)}</strong>
              </div>
              <div>
                <span>Remaining</span>
                <strong className={trip.remaining_cents < 0 ? 'negative' : ''}>{money(trip.remaining_cents)}</strong>
              </div>
            </div>
          </div>

          <nav className="tabs" aria-label="Trip sections">
            {tabs.map((item) => (
              <button
                key={item.id}
                type="button"
                className={tab === item.id ? 'active' : ''}
                onClick={() => setTab(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <main className="page" aria-busy={busy}>
            {tab === 'overview' && (
              <div className="layout-overview">
                {analytics ? (
                  <TripPace trip={trip} analytics={analytics} />
                ) : (
                  <section className="panel">
                    <h2>Trip pace</h2>
                    <p className="muted">Pace analytics are warming up. Everything else below is ready.</p>
                  </section>
                )}
                <section className="panel">
                  <div className="panel-header">
                    <h2>Travelers</h2>
                    {canEdit && (
                      <button className="text-button" type="button" onClick={() => setShowMember(true)}>Add member</button>
                    )}
                  </div>
                  <ul className="member-list">
                    {trip.members.map((member) => (
                      <li key={member.id}><Avatar name={member.name} /><span>{member.name}</span></li>
                    ))}
                  </ul>
                </section>
                <section className="panel">
                  <div className="panel-header">
                    <h2>Recent activity</h2>
                    <button className="text-button" type="button" onClick={() => setTab('expenses')}>See all</button>
                  </div>
                  <div className="stack">
                    {trip.expenses.slice(0, 5).map((expense) => (
                      <ExpenseRow key={expense.id} expense={expense} compact />
                    ))}
                    {!trip.expenses.length && <p className="muted">No expenses yet. Add the first receipt to start the ledger.</p>}
                  </div>
                </section>
                <section className="panel">
                  <div className="panel-header">
                    <h2>Settlement snapshot</h2>
                    <button className="text-button" type="button" onClick={() => setTab('settle')}>Settle up</button>
                  </div>
                  <div className="balance-grid">
                    {balances.map((balance) => (
                      <div key={balance.member_id} className="balance-chip">
                        <Avatar name={balance.name} small />
                        <div>
                          <strong>{balance.name}</strong>
                          <span className={balance.net_cents >= 0 ? 'positive' : 'negative'}>
                            {balance.net_cents >= 0 ? `should receive ${money(balance.net_cents)}` : `owes ${money(Math.abs(balance.net_cents))}`}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
                <section className="panel">
                  <div className="panel-header"><h2>Category mix</h2></div>
                  {analytics ? (
                    <CategoryChart data={analytics.spending_by_category} />
                  ) : (
                    <p className="muted">Category breakdown will appear once analytics finish loading.</p>
                  )}
                </section>
              </div>
            )}

            {tab === 'expenses' && (
              <div className="layout-expenses">
                <div className="panel-header">
                  <h2>Expenses</h2>
                  <div className="filter-row">
                    <label>
                      <span className="sr-only">Filter by category</span>
                      <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                        <option value="All">All categories</option>
                        {categories.map((category) => <option key={category} value={category}>{category}</option>)}
                      </select>
                    </label>
                    {canEdit && (
                      <button className="button" type="button" onClick={() => setShowExpense(true)} disabled={!trip.members.length}>
                        Add expense
                      </button>
                    )}
                  </div>
                </div>
                <div className="stack">
                  {filteredExpenses.map((expense) => (
                    <ExpenseRow
                      key={expense.id}
                      expense={expense}
                      onDelete={canEdit ? handleDeleteExpense : undefined}
                    />
                  ))}
                  {!filteredExpenses.length && <EmptyState title="No matching expenses">Try another category or add a new expense.</EmptyState>}
                </div>
              </div>
            )}

            {tab === 'settle' && (
              <div className="layout-settle">
                <section className="settle-hero panel">
                  <span className="eyebrow">Settle up</span>
                  <h2>Only {settlements.payment_count} payment{settlements.payment_count === 1 ? '' : 's'} needed</h2>
                  <p>These transfers clear every balance without processing money here.</p>
                </section>
                <section className="panel">
                  <h2>Suggested transfers</h2>
                  <div className="stack">
                    {settlements.transfers.map((transfer) => (
                      <article key={`${transfer.from_member_id}-${transfer.to_member_id}-${transfer.amount_cents}`} className="transfer-row">
                        <div className="transfer-people">
                          <Avatar name={transfer.from_name} />
                          <span>{transfer.from_name}</span>
                          <span className="arrow">pays</span>
                          <Avatar name={transfer.to_name} />
                          <span>{transfer.to_name}</span>
                        </div>
                        <strong>{money(transfer.amount_cents)}</strong>
                      </article>
                    ))}
                    {!settlements.transfers.length && <p className="muted">Everyone is settled. Nice work.</p>}
                  </div>
                </section>
                <section className="panel">
                  <h2>Balances</h2>
                  <div className="stack">
                    {balances.map((balance) => (
                      <article key={balance.member_id} className="balance-detail">
                        <Avatar name={balance.name} />
                        <div>
                          <strong>{balance.name}</strong>
                          <span>Paid {money(balance.paid_cents)} · Share {money(balance.share_cents)}</span>
                        </div>
                        <em className={balance.net_cents >= 0 ? 'positive' : 'negative'}>
                          {balance.net_cents >= 0 ? `+${money(balance.net_cents)}` : money(balance.net_cents)}
                        </em>
                      </article>
                    ))}
                  </div>
                </section>
              </div>
            )}

            {tab === 'insights' && analytics && (
              <div className="layout-insights">
                <section className="insight-strip">
                  <article>
                    <span>Average daily spend</span>
                    <strong>{money(analytics.average_daily_spend_cents)}</strong>
                  </article>
                  <article>
                    <span>Expected to date</span>
                    <strong>{money(analytics.expected_spend_to_date_cents)}</strong>
                  </article>
                  <article>
                    <span>Pace difference</span>
                    <strong className={analytics.spending_pace_difference_cents > 0 ? 'negative' : 'positive'}>
                      {money(analytics.spending_pace_difference_cents)}
                    </strong>
                  </article>
                  <article>
                    <span>Forecasted final</span>
                    <strong>{money(analytics.forecasted_final_cost_cents)}</strong>
                  </article>
                </section>
                <section className="panel">
                  <h2>Spending by day</h2>
                  <DailyChart data={analytics.spending_by_day} />
                </section>
                <section className="panel">
                  <h2>Spending by category</h2>
                  <CategoryChart data={analytics.spending_by_category} />
                </section>
              </div>
            )}
          </main>

          <section className="trip-list-strip" aria-label="All trips">
            <div className="panel-header">
              <h2>Trips</h2>
              {canEdit && (
                <button className="text-button" type="button" onClick={() => setShowCreateTrip(true)}>Create trip</button>
              )}
            </div>
            <div className="trip-grid">
              {trips.map((item) => (
                <TripCard
                  key={item.id}
                  trip={item}
                  canEdit={canEdit}
                  onOpen={() => {
                    setSelectedTripId(item.id)
                    setTab('overview')
                  }}
                  onDelete={() => handleDeleteTrip(item.id)}
                />
              ))}
            </div>
          </section>
        </>
      )}

      {canEdit && showCreateTrip && (
        <CreateTripDialog
          busy={busy}
          onClose={() => setShowCreateTrip(false)}
          onSubmit={handleCreateTrip}
        />
      )}
      {canEdit && showMember && (
        <AddMemberDialog
          busy={busy}
          onClose={() => setShowMember(false)}
          onSubmit={handleAddMember}
        />
      )}
      {canEdit && showExpense && trip && (
        <CreateExpenseDialog
          trip={trip}
          busy={busy}
          onClose={() => setShowExpense(false)}
          onSubmit={handleAddExpense}
        />
      )}
    </div>
  )
}

function AccessGate({ onGuest, onUnlock }) {
  const [pin, setPin] = useState('')
  const [status, setStatus] = useState('idle')
  const [message, setMessage] = useState('')

  async function handleUnlock(event) {
    event.preventDefault()
    setStatus('submitting')
    setMessage('')
    try {
      await onUnlock(pin)
    } catch (err) {
      setStatus('idle')
      setMessage(err.message)
    }
  }

  return (
    <div className="access-gate">
      <section className="access-card" aria-labelledby="access-title">
        <span className="brand-mark">SE</span>
        <h1 id="access-title">SharedExpenses</h1>
        <p>Browse the demo as a guest, or enter the PIN to manage trips.</p>
        <button className="button" type="button" onClick={onGuest}>
          View as guest
        </button>
        <div className="access-divider"><span>or unlock with PIN</span></div>
        <form className="access-pin-form" onSubmit={handleUnlock}>
          <label>
            5-digit PIN
            <input
              inputMode="numeric"
              pattern="[0-9]{5}"
              maxLength={5}
              autoComplete="one-time-code"
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 5))}
              placeholder="•••••"
              aria-describedby={message ? 'access-error' : undefined}
            />
          </label>
          <button className="button secondary" type="submit" disabled={pin.length !== 5 || status === 'submitting'}>
            Unlock
          </button>
        </form>
        {message && <p id="access-error" className="access-error" role="alert">{message}</p>}
      </section>
    </div>
  )
}

function CreateTripDialog({ onClose, onSubmit, busy }) {
  const [form, setForm] = useState({
    name: '',
    destination: '',
    start_date: todayIso(),
    end_date: todayIso(),
    total_budget: '500',
  })

  return (
    <Modal title="Create a trip" description="Set the destination, dates, and shared budget." onClose={onClose}>
      <form
        className="form-grid"
        onSubmit={(event) => {
          event.preventDefault()
          onSubmit({
            ...form,
            total_budget: Number(form.total_budget),
          })
        }}
      >
        <label>Trip name<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="New York Weekend" /></label>
        <label>Destination<input required value={form.destination} onChange={(event) => setForm({ ...form, destination: event.target.value })} placeholder="New York City" /></label>
        <label>Start date<input required type="date" value={form.start_date} onChange={(event) => setForm({ ...form, start_date: event.target.value })} /></label>
        <label>End date<input required type="date" value={form.end_date} onChange={(event) => setForm({ ...form, end_date: event.target.value })} /></label>
        <label>Total budget ($)
          <input required type="number" min="0.01" step="0.01" value={form.total_budget} onChange={(event) => setForm({ ...form, total_budget: event.target.value })} />
        </label>
        <div className="form-actions">
          <button className="button secondary" type="button" onClick={onClose}>Cancel</button>
          <button className="button" type="submit" disabled={busy}>Create trip</button>
        </div>
      </form>
    </Modal>
  )
}

function AddMemberDialog({ onClose, onSubmit, busy }) {
  const [name, setName] = useState('')
  return (
    <Modal title="Add traveler" description="Keep names simple. No accounts required." onClose={onClose}>
      <form
        className="form-grid"
        onSubmit={(event) => {
          event.preventDefault()
          onSubmit(name.trim())
        }}
      >
        <label>Name<input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Alex" /></label>
        <div className="form-actions">
          <button className="button secondary" type="button" onClick={onClose}>Cancel</button>
          <button className="button" type="submit" disabled={busy || !name.trim()}>Add member</button>
        </div>
      </form>
    </Modal>
  )
}

function CreateExpenseDialog({ trip, onClose, onSubmit, busy }) {
  const [form, setForm] = useState({
    description: '',
    amount: '',
    category: 'Food',
    date: todayIso(),
    paid_by_member_id: trip.members[0]?.id || '',
    participant_ids: trip.members.map((member) => member.id),
  })

  function toggleParticipant(memberId) {
    setForm((current) => {
      const exists = current.participant_ids.includes(memberId)
      return {
        ...current,
        participant_ids: exists
          ? current.participant_ids.filter((id) => id !== memberId)
          : [...current.participant_ids, memberId],
      }
    })
  }

  return (
    <Modal title="Add expense" description="Choose who paid and who should share the cost." onClose={onClose} wide>
      <form
        className="form-grid expense-form"
        onSubmit={(event) => {
          event.preventDefault()
          onSubmit({
            description: form.description.trim(),
            amount: Number(form.amount),
            category: form.category,
            date: form.date,
            paid_by_member_id: Number(form.paid_by_member_id),
            participant_ids: form.participant_ids,
          })
        }}
      >
        <label>Description<input required value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Joe's Pizza" /></label>
        <label>Amount ($)
          <input required type="number" min="0.01" step="0.01" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} />
        </label>
        <label>Category
          <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
            {categories.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
        </label>
        <label>Date<input required type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label>
        <label>Paid by
          <select required value={form.paid_by_member_id} onChange={(event) => setForm({ ...form, paid_by_member_id: Number(event.target.value) })}>
            {trip.members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
          </select>
        </label>
        <fieldset>
          <legend>Participants</legend>
          <div className="participant-grid">
            {trip.members.map((member) => (
              <label key={member.id} className="check-pill">
                <input
                  type="checkbox"
                  checked={form.participant_ids.includes(member.id)}
                  onChange={() => toggleParticipant(member.id)}
                />
                <span>{member.name}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="form-actions">
          <button className="button secondary" type="button" onClick={onClose}>Cancel</button>
          <button className="button" type="submit" disabled={busy || !form.participant_ids.length}>Save expense</button>
        </div>
      </form>
    </Modal>
  )
}

export default App
