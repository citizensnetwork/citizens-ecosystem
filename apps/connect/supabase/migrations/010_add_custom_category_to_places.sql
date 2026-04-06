-- Add custom_category column to places for "other" category descriptions
alter table public.places add column if not exists custom_category text;
