-- ============================================================
-- SCAFFOLD OS - Diagnose: Lager-Konsistenz (Phase-67-Begleitung)
-- VERSION 2 (korrigiert) — Tabelle: inventory (NICHT inventory_items)
-- REIN LESEND. Aendert KEINE Zeile. SQL Editor -> RUN.
-- ============================================================

-- CHECK 0: Welche Spalten hat 'inventory'? (Orientierung)
select column_name, data_type
from information_schema.columns
where table_name = 'inventory'
order by ordinal_position;

-- CHECK 1: Nicht abgeschlossene Transporte (Alt-Code-Verdacht:
-- diese wurden unter dem alten Code angelegt, Bestand nie abgezogen)
select t.id, t.status, t.quantity as menge, t.created_at,
       i.name as artikel, pf.name as von_projekt, pt.name as nach_projekt
from transport_orders t
join inventory i      on i.id  = t.inventory_id
left join projects pf on pf.id = t.from_project_id
left join projects pt on pt.id = t.to_project_id
where t.status not in ('delivered', 'cancelled')
order by t.created_at asc;

-- CHECK 2: Baustellen: reserviert aber nie angekommen
--          (der "Merola-Fall": physisch 0, reserviert 13)
select s.id, p.name as baustelle, i.name as artikel,
       s.quantity as physisch_da, s.reserved_quantity as reserviert,
       (s.quantity - s.reserved_quantity) as verfuegbar
from site_stock s
join inventory i on i.id = s.inventory_id
join projects p  on p.id = s.project_id
where s.reserved_quantity > s.quantity
order by p.name, i.name;

-- CHECK 3: Negative Zentrallager-Bestaende (darf es nie geben)
select id, name, quantity, min_stock
from inventory
where quantity < 0
order by name;

-- CHECK 4: Status-Inkonsistenz (geliefert ohne Abschlusszeit)
select id, status, quantity, created_at, completed_at
from transport_orders
where status = 'delivered' and completed_at is null;

-- CHECK 5: Zaehlliste zum Nachzaehlen
select id, name, quantity, unit, min_stock
from inventory
order by name;

-- REPARATUR-BEISPIELE - NUR nach Abstimmung, bewusst auskommentiert:
-- delete from transport_orders where id in ('<uuid-1>', '<uuid-2>');
-- update site_stock set reserved_quantity = 0 where id = '<uuid>' and quantity = 0;
-- update inventory set quantity = <ECHTER_ZAEHLSTAND> where id = '<uuid>';
