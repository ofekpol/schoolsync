# Infrastructure Cost & Scaling Plan

Last measured: **2026-11-03** · Prices checked: **2026-11-03** (sources at the bottom).
Refresh this doc every quarter, or whenever we sign a new school. Use the commands in §7.

All prices are USD per month unless marked otherwise.

---

## 1. TL;DR

| Scale | Monthly total (recommended setup) | Per school |
|---|---|---|
| **1 school** (today) | **~$47** | $47 |
| **5 schools** | **~$47–67** | ~$10–13 |
| **20 schools** | **~$105**, or **~$205** with point-in-time recovery | ~$5–10 |
| **100 schools** | **~$345–365** | ~$3.5 |

**Two things to fix now, before any growth:**

1. **Vercel Hobby is for non-commercial use only.** Once a school pays us, we must be on **Pro** ($20/seat).
2. **Supabase Free has no backups and pauses after 1 week of inactivity.** Losing a school's calendar would be very bad for us. Move production to **Pro** ($25): daily backups, 7-day retention, no pausing.

At this scale the database is not a cost concern. Most of the money goes to fixed plan fees, plus PITR once we decide we need it.

---

## 2. Where we are today

### Plans

| Service | Plan | Cost |
|---|---|---|
| Vercel (`ofekpols-projects` / `school-gantt`) | Hobby | $0 |
| Supabase (`ofekpol's Org`: prod + staging, eu-central-1) | Free (both free project slots used) | $0 |
| Resend (invites, password reset) | Free (assumed) | $0 |
| Groq (staff AI) | Not priced in this doc | — |
| Domain | `school-gantt.vercel.app` (no custom domain) | $0 |
| Error monitoring / uptime | None | $0 |

### Usage vs. free-tier limits

| Metric | Now | Free limit | Used | Pro limit |
|---|---|---|---|---|
| DB size, whole database (prod) | 14 MB | 500 MB | ~3% | 8 GB |
| App data (`public` schema) | 1.6 MB | — | — | — |
| Auth users / MAU (30 days) | 39 / 22 | 50,000 MAU | <0.1% | 100,000 MAU |
| DB connections | 12 active / 60 max | 60 (Micro) | 20% | depends on compute |
| Schools / staff / events | 1 / 36 / 260 | — | — | — |
| Event revisions / iCal subs / invites | 289 / 11 / 15 | — | — | — |
| Supabase log lines (24 h) | ~340 (mostly pooler) | — | — | — |
| Vercel requests / bandwidth / CPU | **Not available on Hobby via API** — check the dashboard Usage tab | 1M invocations, 100 GB transfer, 4 h CPU | ? | see §3 |
| Vercel Web Analytics pageviews (30 days) | 0 (not enabled) | 50K events | — | — |

**Growth signal:** 260 events in about 5 months. Most were bulk-loaded in July (159) and October (66). That is about **2 MB of app data per school per year**, including revisions and auth rows.

---

## 3. Service tiers

### 3.1 Vercel

| | Hobby | **Pro** |
|---|---|---|
| Price | $0 | **$20 / developer seat** (viewer seats free) |
| Included credit | — (hard caps, no overage) | $20 usage credit / month |
| Commercial use | ❌ Not allowed | ✅ Allowed |
| Fast Data Transfer | 100 GB | 1 TB, then $0.15/GB |
| Edge / CDN requests | 1M | 10M, then $2 / 1M |
| Function invocations | 1M | $0.60 / 1M |
| Active CPU | 4 h | $0.128 / h |
| Provisioned memory | 360 GB-h | $0.0106 / GB-h |
| Fast Origin Transfer | 10 GB | $0.06 / GB |
| Observability Plus (metrics API) | ❌ | $1.20 / 1M events |
| Web Analytics | 50K events | $3 / 100K events |
| Speed Insights | 10K events free | Plus: $10 / project + $0.65 / 10K |

**What drives our Vercel bill:** public viewers poll `/api/v1/public/[school]/events/signature` **every 5 s** while the tab is visible ([use-public-viewer-events.ts](../lib/views/use-public-viewer-events.ts)). Each poll is one function invocation plus a small DB query. The response is a small signature, so data transfer stays low. The cost is in invocation count and CPU.

**Estimated per school** (100 staff + ~300 parent devices, about 3 visible-tab minutes per viewer per day, plus page renders and iCal pulls):

| Item | Per school / month | Cost on Pro |
|---|---|---|
| Function invocations | ~0.75M | ~$0.45 |
| Active CPU (~10 ms each) | ~2 h | ~$0.27 |
| Provisioned memory | ~40 GB-h | ~$0.44 |
| Edge requests | ~1.5M | $0 until 10M total |
| **Total usage** | | **~$1.2 / school** |

So the $20 credit covers usage up to about **15 schools**. On Hobby, 1–2 schools could already reach the 1M-invocation / 4 h CPU caps. Check the Usage tab to confirm.

### 3.2 Supabase

| | Free | **Pro** | Team |
|---|---|---|---|
| Price | $0 | **$25 / org** (+ $10 compute credit) | $599 / org |
| DB disk | 500 MB / project | 8 GB, then $0.125/GB | same |
| Egress | 5 GB | 250 GB, then $0.09/GB | same |
| MAU | 50,000 | 100,000, then $0.00325 | same |
| File storage | 1 GB | 100 GB | same |
| Backups | ❌ | Daily, 7 days | Daily, 14 days |
| Pauses when idle | After 1 week | Never | Never |
| Log retention | 1 day | 7 days | 28 days |
| PITR add-on | ❌ | $100 / 7 days of retention | same |
| Custom domain (auth / API) | ❌ | $10 / project | same |
| Branching | ❌ | $0.01344 / branch-hour (~$10 / month if always on) | same |

**Compute add-ons (per project, billed hourly):**

| Size | Price | CPU | RAM | Net cost on Pro (after $10 credit) |
|---|---|---|---|---|
| Micro | $10 | shared | 1 GB | $0 |
| Small | $15 | shared | 2 GB | $5 |
| Medium | $60 | shared | 4 GB | $50 |
| Large | $110 | 2 dedicated | 8 GB | $100 |
| XL | $210 | 4 dedicated | 16 GB | $200 |

**Staging:** every project in a Pro org is billed for its own compute, so staging there adds about $10/month. Cheaper option: **move staging to a separate free org.** It costs $0, and pausing is fine for staging.

### 3.3 Resend (email)

| Plan | Price | Emails / month | Daily cap | Domains |
|---|---|---|---|---|
| Free | $0 | 3,000 | **100 / day** | 3 |
| Pro | $20 | 50,000 | none | 10 |
| Pro | $35 | 100,000 | none | 10 |
| Scale | $90+ | 100,000+ | none | 1,000 |

Watch the **100/day cap**. Onboarding one school means sending about 100 invites, which uses the whole free daily quota in one day. Upgrade to Pro once we onboard schools regularly.

### 3.4 Error monitoring: Sentry (not installed yet)

| Plan | Price | Errors / month | Users | Retention |
|---|---|---|---|---|
| Developer | $0 | 5,000 | 1 | 30 days |
| Team | $29 ($26 billed yearly) | 50,000 | unlimited | 90 days |
| Business | $89 | 50,000 | unlimited | 90 days+ |

### 3.5 Uptime monitoring: Better Stack

Free plan: **10 monitors and heartbeats, 1 status page, email and Slack alerts.** That is enough for us: production homepage, one public school view, `/ical/[token]`, and the staging homepage. Paid plans are only needed for phone/SMS on-call or more status pages.

### 3.6 Domain

| Item | Cost |
|---|---|
| App domain (e.g. `.com` / `.co.il`) | ~$10–20 / year (~$1.5 / month) |
| Email sending domain (SPF/DKIM on the same domain, used by Resend) | $0 |
| Supabase custom auth domain (optional: Google OAuth consent screen shows our domain instead of `*.supabase.co`) | $10 / month |

---

## 4. Scale scenarios

Assumptions per school: ~100 staff accounts (MAU), ~300 public viewer devices (no accounts), ~2 MB/year of DB data, ~1.2 Vercel usage-dollars/month.

### Projected usage

| Metric | 1 school | 5 | 20 | 100 |
|---|---|---|---|---|
| DB size (after 2 years) | ~20 MB | ~35 MB | ~100 MB | ~0.5 GB |
| Staff MAU | 100 | 500 | 2,000 | 10,000 |
| Vercel function invocations | 0.75M | 3.75M | 15M | 75M |
| Vercel active CPU | 2 h | 10 h | 40 h | 200 h |
| Peak DB connections | low | low | moderate | **high: watch** |
| Emails / month (steady; spikes at onboarding) | <100 | ~300 | ~1,000 | ~5,000 |

DB size, MAU and egress stay **far below** Pro quotas even at 100 schools. Upgrades will come from **CPU and connections**, not storage.

### Monthly cost per scenario

| Line item | 1 school | 5 | 20 | 100 |
|---|---|---|---|---|
| Vercel Pro (1 seat) | 20 | 20 | 20 | 20 |
| Vercel usage over credit | 0 | 0 | ~4 | ~100 |
| Supabase Pro | 25 | 25 | 25 | 25 |
| Supabase compute (net) | 0 (Micro) | 0 (Micro) | 5 (Small) | 50 (Medium) |
| Supabase PITR (7 days) | — | — | 100 *(optional)* | 100 |
| Staging (separate free org) | 0 | 0 | 0 | 0 |
| Resend | 0 | 0–20 | 20 | 20 |
| Sentry | 0 | 0 | 29 | 29 |
| Better Stack | 0 | 0 | 0 | 0 |
| Domain | ~1.5 | ~1.5 | ~1.5 | ~1.5 |
| **Total** | **~$47** | **~$47–67** | **~$105 / ~$205 with PITR** | **~$345** |
| Optional: 2nd Vercel dev seat | | | | +20 |
| Optional: Supabase custom auth domain | +10 | +10 | +10 | +10 |

---

## 5. Upgrade triggers

Check these numbers monthly. When one crosses its threshold, make the change listed.

| Signal | Threshold | Action | Added cost |
|---|---|---|---|
| First paying school | — | Vercel Hobby → Pro | +$20 |
| Any production data we can't afford to lose | **now** | Supabase Free → Pro, staging to a separate free org | +$25 |
| Supabase CPU (Reports → Database) | >70% sustained during school hours | Micro → Small → Medium | +$5 / +$50 |
| RAM / swap use | Swap used regularly | Next compute size | see §3.2 |
| DB connections (`pg_stat_activity`) | >70% of max | Bigger compute (more connections); confirm we use the pooler (port 6543) | — |
| DB size | >6 GB (75% of 8 GB) | Nothing to do; overage is $0.125/GB | ~$0 |
| Vercel usage | >$15 of the $20 credit | Cache the signature endpoint at the CDN (see §6) before paying more | — |
| Gantt p95 first paint | >2 s (SLO) | Speed Insights → profile → compute upgrade if DB-bound | — |
| Email bounces / daily cap hit | 100/day reached | Resend Free → Pro | +$20 |
| Errors / month | >5,000, or a 2nd person needs access | Sentry Developer → Team | +$29 |
| Contract with a school promises an RPO/RTO | contract signed | Supabase PITR | +$100 |
| More than 1 developer deploying | 2nd developer | +1 Vercel seat | +$20 |

---

## 6. Cost levers (cheap wins before upgrading)

1. **Done (PR #55): the Vercel CDN now caches the poll endpoints.** `/api/v1/public/[school]/events{,/signature}` send `Cache-Control: public, max-age=0, s-maxage=5`, so the CDN answers repeat polls for 5 s without running a function. All viewers of one school share a single invocation per 5 s window, an estimated 80–95% cut in invocations and CPU. The per-school Vercel estimates in §3.1 and §4 are from before this change, so they are now an upper bound. Re-measure on the Usage tab after deploy.
2. **Slow polling when idle:** e.g. poll every 30 s after 5 minutes with no interaction. Visible-tab polling already stops when the tab is hidden.
3. **Staging in a free org** saves $10/month compared with a 2nd project in the Pro org.
4. **Skip PITR** until a contract or data volume justifies it. Pro's daily backups cover most cases.
5. **Annual billing** where offered (Sentry Team $26 instead of $29).

---

## 7. How to re-measure

### Supabase (MCP `execute_sql` on project `mfrtdirkknuvweaiqfzs`, or the SQL editor)

```sql
-- Size, row counts, connections
select pg_size_pretty(pg_database_size(current_database())) as db_size,
  (select count(*) from schools) schools,
  (select count(*) from staff_users) staff,
  (select count(*) from auth.users) auth_users,
  (select count(*) from events) events,
  (select count(*) from event_revisions) revisions,
  (select count(*) from ical_subscriptions) ical_subs,
  (select setting from pg_settings where name='max_connections') max_conn,
  (select count(*) from pg_stat_activity) active_conn;

-- MAU and app-data size
select (select count(*) from auth.users where last_sign_in_at > now() - interval '30 days') mau_30d,
  pg_size_pretty(sum(pg_total_relation_size(c.oid))) public_schema_size
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r';

-- Event growth by month
select to_char(date_trunc('month', created_at), 'YYYY-MM') m, count(*)
from events group by 1 order by 1;
```

- Org plan: MCP `get_organization` (`widtgmfxltkqreqdojki`).
- CPU / RAM / egress: Supabase dashboard → Reports and Org → Usage. These are not exposed through MCP.
- Log volume: MCP `query_logs`: `select source, count(*) from logs group by source`.

### Vercel

- Usage (invocations, CPU, transfer): **Dashboard → Team → Usage.** On Hobby, the metrics API (`create_observability_query` / `vercel metrics`) returns 402. On Pro with Observability Plus, query `vercel.function_invocation.count`, `vercel.function_invocation.function_cpu_time_ms`, `vercel.request.fdt_total_bytes`.
- Billing: MCP `list_billing_charges` (team `team_x3jYNBUgpVgM3vIk98K1HpdG`). Returns `costs_not_found` while on Hobby.
- Pageviews: MCP `count_pageviews` (project `prj_8KIW7QrhKk7vcO6i90jfFUTkkXpB`). Web Analytics must be enabled first.

### Resend

- Dashboard → Usage (emails per day and month).

---

## Sources (checked 2026-11-03)

- Supabase pricing: <https://supabase.com/pricing>
- Supabase billing model: <https://supabase.com/docs/guides/platform/org-based-billing>
- Vercel pricing: <https://vercel.com/pricing>
- Resend pricing: <https://resend.com/pricing>
- Sentry pricing: <https://sentry.io/pricing/>
- Better Stack pricing: <https://betterstack.com/pricing>
