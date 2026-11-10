-- ============================================================
-- PRAE — Drop everything and start fresh.
-- Run this FIRST, then run setup.sql.
-- ============================================================

drop table if exists project_line_items  cascade;
drop table if exists project_asset_allocations cascade;
drop table if exists package_items       cascade;
drop table if exists item_components     cascade;
drop table if exists projects            cascade;
drop table if exists packages            cascade;
drop table if exists items               cascade;
drop table if exists clients             cascade;
drop table if exists categories          cascade;
drop table if exists settings            cascade;
drop table if exists profiles            cascade;

drop function if exists handle_new_user() cascade;
