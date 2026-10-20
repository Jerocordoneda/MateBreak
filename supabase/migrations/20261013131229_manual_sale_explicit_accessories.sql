-- Manual seller sales consume only the explicit product lines.
-- Retail catalogue checkout retains its packaging rules. Legacy manual box
-- reservations remain auditable and complete with their existing delivery trigger.
begin;
drop trigger mb_caja_venta_manual_item on private.venta_manual_item;
notify pgrst,'reload schema';
commit;
