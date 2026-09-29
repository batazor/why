-- Комнаты собеседований в песочнице: приватные каналы Realtime `room:<uuid>`.
--
-- Канал приватный, поэтому сервер пускает в него только по этим политикам.
-- Слушать и писать может любой вошедший пользователь, знающий имя комнаты;
-- имя — случайный UUID, и пока этого хватает вместо списка приглашённых.
-- Когда появятся свои таблицы комнат, условие сузится до участников комнаты.

create policy "interview rooms: signed-in users receive"
on realtime.messages
for select
to authenticated
using (
  realtime.topic() like 'room:%'
  and realtime.messages.extension in ('broadcast', 'presence')
);

create policy "interview rooms: signed-in users send"
on realtime.messages
for insert
to authenticated
with check (
  realtime.topic() like 'room:%'
  and realtime.messages.extension in ('broadcast', 'presence')
);
