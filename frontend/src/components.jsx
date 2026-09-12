import { ArrowRight, CalendarDays, MapPin, Plane, ReceiptText, X } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { initials, money, shortDate } from './utils'

const categoryColors = {
  Food: '#d96c4d',
  Transportation: '#2e7d73',
  Lodging: '#394f68',
  Entertainment: '#d19b3c',
  Shopping: '#8b5d7e',
  Other: '#7f817c',
}

export function Avatar({ name, small = false }) {
  return (
    <span className={`avatar ${small ? 'avatar-small' : ''}`} aria-hidden="true">
      <span className="avatar-letter">{initials(name)}</span>
    </span>
  )
}

export function Modal({ title, description, onClose, children, wide = false }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <header className="modal-header">
          <div>
            <h2 id="modal-title">{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close dialog"><X size={20} /></button>
        </header>
        {children}
      </section>
    </div>
  )
}

export function TripCard({ trip, onOpen, onDelete, canEdit = true }) {
  const ratio = trip.total_budget_cents ? Math.min(trip.spent_cents / trip.total_budget_cents * 100, 100) : 0
  return (
    <article className="trip-card">
      <button className="trip-card-main" type="button" onClick={onOpen}>
        <span className="trip-route">
          <Plane size={18} /> {trip.destination}
          {trip.is_demo && <span className="demo-badge">Demo</span>}
        </span>
        <h2>{trip.name}</h2>
        <p className="trip-dates"><CalendarDays size={16} /> {shortDate(trip.start_date)} – {shortDate(trip.end_date)}</p>
        <div className="trip-card-budget">
          <span><strong>{money(trip.spent_cents, { compact: true })}</strong> spent</span>
          <span>{trip.member_count} traveler{trip.member_count === 1 ? '' : 's'}</span>
        </div>
        <div className="mini-progress"><span style={{ width: `${ratio}%` }} /></div>
        <span className="open-trip">Open trip <ArrowRight size={16} /></span>
      </button>
      {canEdit && (
        <button className="text-button danger" type="button" onClick={onDelete}>Delete trip</button>
      )}
    </article>
  )
}

export function TripPace({ trip, analytics }) {
  const budgetWidth = Math.min(analytics.budget_used_percentage, 100)
  const tripWidth = Math.min(Math.max(analytics.trip_progress_percentage, 0), 100)
  const over = analytics.projected_budget_difference_cents < 0
  const paceAhead = analytics.pace_percentage_points > 0
  const markerSide = tripWidth > 82 ? 'near-end' : tripWidth < 12 ? 'near-start' : ''
  return (
    <section className="trip-pace" aria-labelledby="pace-title">
      <div className="pace-heading">
        <div>
          <span className="eyebrow">Trip pace</span>
          <h2 id="pace-title">{money(analytics.current_spend_cents, { compact: true })} <small>of {money(trip.total_budget_cents, { compact: true })} spent</small></h2>
        </div>
        <span className={`status-stamp ${over ? 'status-warn' : ''}`}>
          {analytics.status === 'active' ? `${analytics.remaining_days} days left` : analytics.status}
        </span>
      </div>
      <div className="pace-track" aria-label={`${analytics.budget_used_percentage}% of budget used`}>
        <span className="pace-fill" style={{ width: `${budgetWidth}%` }} />
        <span className={`pace-marker ${markerSide}`} style={{ left: `${tripWidth}%` }}><i>Today</i></span>
      </div>
      <div className="pace-comparison">
        <span>Trip completed <strong>{analytics.trip_progress_percentage}%</strong></span>
        <span>Budget used <strong>{analytics.budget_used_percentage}%</strong></span>
      </div>
      <div className="pace-forecast">
        <div>
          <span className="eyebrow">{analytics.status === 'active' ? 'At your current pace' : analytics.status === 'completed' ? 'Final spend' : 'Logged so far'}</span>
          <strong>{money(analytics.forecasted_final_cost_cents, { compact: true })}</strong>
          <small>{analytics.status === 'active' ? 'projected final spend' : analytics.status === 'completed' ? 'trip total' : 'before the trip starts'}</small>
        </div>
        <div>
          <span className="eyebrow">Budget outlook</span>
          <strong className={over ? 'negative' : 'positive'}>
            {money(Math.abs(analytics.projected_budget_difference_cents), { compact: true })} {over ? 'over' : 'under'}
          </strong>
          <small>
            {analytics.status === 'upcoming'
              ? 'Pace projection begins once the trip starts'
              : paceAhead
                ? `Spending is ${Math.abs(analytics.pace_percentage_points)} points ahead of trip pace`
                : 'Spending is tracking with trip pace'}
          </small>
        </div>
        <div>
          <span className="eyebrow">Stay on budget</span>
          <strong>{money(analytics.target_remaining_daily_spend_cents, { compact: true })}<em>/day</em></strong>
          <small>{analytics.remaining_days ? 'target for remaining days' : 'no remaining days'}</small>
        </div>
      </div>
    </section>
  )
}

export function ExpenseRow({ expense, onDelete, compact = false }) {
  return (
    <article className={`expense-row ${compact ? 'expense-row-compact' : ''}`}>
      <span className="category-dot" style={{ background: categoryColors[expense.category] }} aria-hidden="true" />
      <div className="expense-main">
        <strong>{expense.description}</strong>
        <span>{expense.category} · {shortDate(expense.date)}</span>
      </div>
      <div className="expense-paid">
        <span>Paid by {expense.payer.name}</span>
        <strong>{money(expense.amount_cents)}</strong>
      </div>
      <div className="expense-split">
        {expense.participants.length} participant{expense.participants.length === 1 ? '' : 's'}
      </div>
      {onDelete && <button className="icon-button delete-expense" type="button" onClick={() => onDelete(expense)} aria-label={`Delete ${expense.description}`}><X size={18} /></button>}
    </article>
  )
}

const ChartTooltip = ({ active, payload, label }) => active && payload?.length ? (
  <div className="chart-tooltip"><span>{label}</span><strong>{money(payload[0].value)}</strong></div>
) : null

export function CategoryChart({ data }) {
  if (!data.length) return <EmptyChart />
  return (
    <div className="chart-wrap">
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} layout="vertical" margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
          <CartesianGrid stroke="#ece8df" horizontal={false} />
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="category" width={104} tickLine={false} axisLine={false} tick={{ fill: '#5f625e', fontSize: 12 }} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: '#f5f1e9' }} />
          <Bar dataKey="amount_cents" radius={[0, 5, 5, 0]} barSize={22} isAnimationActive={false}>
            {data.map((entry) => <Cell key={entry.category} fill={categoryColors[entry.category]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function DailyChart({ data }) {
  if (!data.length) return <EmptyChart />
  const formatted = data.map((item) => ({ ...item, label: shortDate(item.date) }))
  return (
    <div className="chart-wrap chart-wrap-daily">
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={formatted} margin={{ top: 12, right: 8, left: 4, bottom: 4 }}>
          <CartesianGrid stroke="#ece8df" vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: '#777a75', fontSize: 12 }} dy={4} />
          <YAxis
            width={42}
            tickFormatter={(value) => `$${Math.round(value / 100)}`}
            tickLine={false}
            axisLine={false}
            tick={{ fill: '#777a75', fontSize: 12 }}
          />
          <Tooltip content={<ChartTooltip />} />
          <Line type="monotone" dataKey="amount_cents" stroke="#d15c3f" strokeWidth={3} isAnimationActive={false} dot={{ fill: '#fff', stroke: '#d15c3f', strokeWidth: 2, r: 4 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function EmptyChart() {
  return <div className="empty-chart"><ReceiptText size={26} /><span>Spending data will appear here.</span></div>
}

export function EmptyState({ title, children }) {
  return <div className="empty-state"><MapPin size={26} /><strong>{title}</strong><p>{children}</p></div>
}
