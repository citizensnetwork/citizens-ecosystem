-- Migration 008: Add avatar_url to profiles
-- Allows users to upload profile pictures

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
