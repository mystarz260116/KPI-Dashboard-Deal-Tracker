update public.deals d
set customer_code = p.merged_customer_code
from public.prospect_customers p
where d.prospect_customer_id = p.id
  and d.customer_code is null
  and p.merged_customer_code is not null;
