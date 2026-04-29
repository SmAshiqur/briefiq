# BriefIQ — Your Personal AI Briefing System

> *Not a news app. A question-driven intelligence agent that tracks what actually matters to you.*

---

## The Problem

Most news apps are built around **topics**. Users are forced to follow broad categories like "Tech" or "Business" and get buried in irrelevant content. The result: notification fatigue, low signal-to-noise ratio, and apps that get uninstalled within days.

People don't think in topics. They think in **questions**:

- *"Is the iPhone price dropping in Bangladesh?"*
- *"Any new scholarships this week?"*
- *"What's happening with the dollar rate?"*
- *"When does BUET open admissions?"*

No existing app answers this the right way.

---

## The Solution

**BriefIQ** is a question-first, AI-powered briefing system. Users submit specific questions or tracking requests — the system checks them on a schedule, evaluates whether anything meaningful has changed, and delivers a concise personal briefing only when there's something worth knowing.

**Core principle: Silence is a feature, not a bug.**

---

## How It Works

### 1. User Submits a Tracking Query
Instead of picking a category, the user asks a natural language question:

> *"Track startup funding news in Bangladesh"*
> *"Alert me when Samsung launches a phone under ৳50,000"*
> *"Any changes to import duty policy this week?"*

### 2. AI Schedules & Monitors
The system assigns a smart frequency based on the nature of the query:

| Query Type | Frequency |
|---|---|
| Urgent / breaking (e.g. exchange rates) | Every few hours |
| Regular updates (e.g. job postings) | Daily |
| Slow-moving topics (e.g. policy changes) | Weekly |

### 3. Delta Detection
On each fetch cycle, the AI compares new results against the previous snapshot. It asks: *"Has something meaningfully changed?"* — not just *"Did new content appear?"*

Only genuine signal passes through.

### 4. Personal Briefing Delivered
The user receives a clean, summarized briefing:

> ✅ **2 important updates today**
> ⚪ **Nothing new today** *(your queries are still running)*
> 🔴 **1 major change you should know**

No raw links. No information dump. Filtered, contextual, and concise.

---

## Key Features

### 🧠 Question-First Interface
Users interact with the app like they're talking to a researcher. Natural language in, curated intelligence out.

### 📡 Signal-Only Notifications
Zero noise policy. Notifications only fire when something genuinely meaningful changes. The app is judged by the quality of alerts, not quantity.

### 🔁 Smart Frequency Engine
Queries are auto-classified by urgency and update cadence. Users can also manually set preferences. No one-size-fits-all schedule.

### 🧩 Memory Layer
The system remembers:
- What each user cares about
- How deep they want information (headline vs. detailed)
- Past briefings, so it never repeats old news

The experience evolves and gets smarter over time.

### 📋 Daily Digest Mode
For users who prefer a single daily read: all active queries are bundled into one morning briefing — organized by importance.

---

## Target Users & Use Cases

| User | Query Example |
|---|---|
| 🎓 Student | *"Notify me when BUET admission info changes"* |
| 💰 Business Person | *"Track dollar rate and import policy updates"* |
| 📱 Tech Enthusiast | *"Alert me when Samsung launches under ৳50,000"* |
| 🧑‍💼 Job Seeker | *"New internships in Dhaka this week"* |
| 🌍 Researcher | *"Track Bangladesh startup funding news"* |
| 🏥 Healthcare Worker | *"Any new MoH circulars or policy updates?"* |

---

## What Makes This Different

| Feature | RSS Feeds | News Apps | BriefIQ |
|---|---|---|---|
| Question-based queries | ❌ | ❌ | ✅ |
| AI delta detection | ❌ | ❌ | ✅ |
| Signal-only alerts | ❌ | ❌ | ✅ |
| Smart frequency | ❌ | ❌ | ✅ |
| Memory & personalization | ❌ | Partial | ✅ |
| Local/hyper-specific queries | ❌ | ❌ | ✅ |

---

## Technical Architecture (High-Level)

```
User Query (Natural Language)
        ↓
Query Understanding Layer (AI)
  - Intent extraction
  - Source identification
  - Frequency classification
        ↓
Scheduled Fetch Engine
  - Web search / scraping
  - Source reliability scoring
        ↓
Delta Detection Layer (AI)
  - Compare new vs. previous snapshot
  - Determine if change is meaningful
        ↓
Briefing Generator (AI)
  - Summarize changes in plain language
  - Rank by importance
        ↓
Delivery (Push / Email / In-App)
```

---

## Known Challenges

### Source Reliability
For structured queries (exchange rates, product prices), clean data sources exist. For unstructured queries (internships in Dhaka, local policy circulars), data is scattered and inconsistent. Source quality scoring and fallback handling will be critical.

### Expectation of Silence
Users may interpret "no update" as the app being broken. UX must clearly communicate that silence means the system is working — actively monitoring and finding nothing new.

### Delta Judgment Quality
Determining whether a change is *meaningful* is a subjective AI judgment call. This layer needs continuous improvement and user feedback loops ("Was this update useful?").

---

## Product Philosophy

> Build for **attention respect**, not engagement metrics.
> The best version of this app is one users open less often — but trust completely.

---

## Status

💡 Concept Stage — Open for development

---

*Last updated: April 2026*
