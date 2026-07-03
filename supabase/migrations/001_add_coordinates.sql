-- ============================================
-- Migration: Add coordinates to events table
-- Run this in Supabase SQL Editor
-- ============================================

alter table public.events
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;
