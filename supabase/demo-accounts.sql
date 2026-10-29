-- Run AFTER creating these fictional users in Supabase → Authentication → Users → Add user
-- (tick "Auto Confirm User"):
--   alex.student@campusfix.demo       (student)
--   morgan.faculty@campusfix.demo     (faculty)
--   taylor.facilities@campusfix.demo  (facilities staff)
--   casey.admin@campusfix.demo        (administrator)
-- Everyone signs up as 'student'; only this SQL (run by a project owner) can grant other roles.

update public.profiles p set display_name = v.name, role = v.role::public.user_role
from (values
  ('alex.student@campusfix.demo', 'Alex Rivera', 'student'),
  ('morgan.faculty@campusfix.demo', 'Dr. Morgan Chen', 'faculty'),
  ('taylor.facilities@campusfix.demo', 'Taylor Brooks', 'staff'),
  ('casey.admin@campusfix.demo', 'Casey Morgan', 'admin')
) as v(email, name, role)
join auth.users u on u.email = v.email
where p.id = u.id;

select u.email, p.display_name, p.role from public.profiles p join auth.users u on u.id = p.id order by p.role;
