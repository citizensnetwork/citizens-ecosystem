# Citizens Vision — User Guide

## Introduction

Citizens Vision is a data intelligence platform that helps organisations track activities, measure alignment with goals, and gain insights through dashboards, maps, and timelines.

---

## Getting Started

### 1. Sign Up / Log In

1. Navigate to the application URL
2. Click **Sign Up** to create a new account or **Log In** with existing credentials
3. Confirm your email if prompted (check spam folder)

### 2. Create or Join an Organisation

- **Create**: After login, click "Create Organisation". Provide a name, slug (URL-friendly identifier), and optional description
- **Join**: Ask your org admin to invite you via the Members settings page

### 3. Navigate the Platform

Once inside an organisation, you'll see:

- **Sidebar** (desktop) or **Menu button** (mobile) — access all sections
- **Navbar** — brand link, advisory bell, sign out

---

## Core Features

### Overview

The org homepage shows key statistics: departments, members, activities, active projects, and recent activity count.

### Activities

Activities are the atomic work units in Citizens Vision — meetings, workshops, outreach events, surveys, and more.

- **Create**: Click "New Activity" from the Activities page
- **Filter**: Use the search bar, type dropdown, department filter, or date range
- **View/Edit**: Click any activity card to view details or edit
- **Tags**: Add freeform tags for categorisation

### Dashboard

The dashboard provides metric summaries, trend charts, and department comparisons:

- **Metric Cards** — Total activities, participants, impact scores with growth indicators
- **Trend Chart** — Time-series view of activity volume
- **Department Chart** — Bar chart comparing department activity
- **Type Distribution** — Pie chart of activity types
- **Advanced Analytics** — Period comparison, trend regression, data export
- **Federation** — Cross-org partnership management and shared metrics

### Map

The interactive map plots geo-located activities with clustering, heatmaps, and boundary overlays:

- **Zoom/Pan** — Navigate the map freely
- **Click clusters** — Zoom into activity clusters
- **Layer toggles** — Enable/disable points, heatmap, clusters, boundaries
- **Search** — Find locations using the search bar
- **Geolocation** — Center map on your current location

### Timeline

A chronological activity stream with filtering:

- **Time range** — Filter by date range
- **Department** — Filter by department
- **Search** — Full-text search within timeline entries

### Projects

Group related activities into projects with milestones and goal alignment:

- **Create Project** — Set name, description, dates, department, and status
- **Milestones** — Add checkpoint dates within a project
- **Goal Links** — Connect projects to organisational goals for alignment tracking

### Goals & Alignment

Define measurable objectives and track how activities and projects align:

- **Create Goal** — Set title, description, target date, and metrics
- **Alignment Scores** — Automatically computed based on linked activities
- **Colour Coding** — Red (< 30%), Yellow (30-69%), Green (70%+)

### Advisory

AI-generated insights and actionable recommendations based on your data:

- **Critical/Warning Alerts** — Bell icon shows unread critical advisories
- **Recommendations** — Data-driven suggestions for improvement
- **Dismiss** — Mark advisories as addressed

### Boundaries

Define geographic service areas and analyse activity coverage:

- **Draw/Upload** — Create boundaries via GeoJSON or map drawing
- **Coverage Levels** — Full, partial, or no coverage indicators
- **Analysis** — See which boundaries have activity gaps

### Connect Integration

Sync data from Citizens Connect (community events and places):

- **Events** — View synced community events, claim as activities
- **Places** — View synced community places for location context
- **Sync** — Trigger manual data synchronisation

---

## Mobile Usage

Citizens Vision is fully responsive:

- **Mobile navigation** — Tap the floating menu button (bottom-right) to open the sidebar
- **Touch-friendly** — All controls sized for touch interaction
- **Responsive grids** — Cards and charts reflow for small screens

---

## Settings

### Departments

Manage your organisation's department hierarchy:
- Add, rename, move, or delete departments
- Departments can have parent departments for hierarchy

### Members

Manage organisation membership:
- Invite members by email
- Assign roles: Platform Admin, Org Admin, Org Editor, Org Analyst, Org Viewer
- Remove members (cannot remove yourself)

---

## Roles & Permissions

| Role | View | Create/Edit | Delete | Manage Members | Org Settings |
|------|------|-------------|--------|----------------|--------------|
| Platform Admin | All | All | All | All | All |
| Org Admin | Org data | All in org | All in org | Yes | Yes |
| Org Editor | Org data | Yes | Own items | No | No |
| Org Analyst | Org data | No | No | No | No |
| Org Viewer | Org data | No | No | No | No |

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Escape | Close modals, dismiss mobile sidebar |
| Tab | Navigate between interactive elements |

---

## Troubleshooting

- **Can't log in**: Check email/password. Use "Forgot Password" if needed
- **No data showing**: Verify you've created activities or synced from Connect
- **Map not loading**: Check browser supports WebGL; try refreshing
- **Slow performance**: Clear browser cache; check network connection
