import { syncRegionalProfileExternalStaffMaps } from '../api/_lib/profileExternalStaff.js';

const result = await Promise.all([
  syncRegionalProfileExternalStaffMaps(1),
  syncRegionalProfileExternalStaffMaps(2),
]);

console.log(JSON.stringify(result, null, 2));
