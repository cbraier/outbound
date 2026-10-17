insert into pricing (app, action, dood_cost, cost_brl)
values ('outbound', 'proposal_analyze', 10, 0.050000)
on conflict (app, action) do update
set dood_cost = excluded.dood_cost,
    cost_brl = excluded.cost_brl;
