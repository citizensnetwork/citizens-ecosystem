-- ============================================
-- Migration 002: Add category to events table
-- Run this in Supabase SQL Editor
-- ============================================

alter table public.events
  add column if not exists category text
    check (category in (
      'church-service', 'youth', 'community-outreach', 'worship',
      'bible-study', 'prayer', 'social', 'other'
    ))
    default 'other';
