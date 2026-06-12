update public.deals d
set
  activity_type = 'won',
  executed_action_type = '受注確認',
  pipeline_stage = 'won'
from public.detected_new_orders dno
where d.id = dno.created_deal_id
  and dno.status = 'approved'
  and dno.created_deal_id is not null
  and (
    d.activity_type is distinct from 'won'
    or d.pipeline_stage is distinct from 'won'
    or d.executed_action_type is distinct from '受注確認'
  );
