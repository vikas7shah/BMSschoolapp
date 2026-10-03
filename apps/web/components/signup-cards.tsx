'use client';

import Link from 'next/link';
import { formatShort } from '@bms/shared';
import type { Me, Signup } from '@/lib/api';
import { clockRange } from '@/lib/time';
import { Button, Tile } from './ui';

/** "Classroom 1", "Classroom 1 and 3", or "All classrooms" when it's every one. */
function roomsLabel(ids: string[], names: Record<string, string>): string {
  if (ids.length > 1 && ids.length === Object.keys(names).length) return 'All classrooms';
  const list = ids.map((id) => names[id] ?? 'Classroom').sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (list.length <= 1) return list[0] ?? '';
  const nums = list.map((n) => n.replace(/^Classroom\s+/i, ''));
  return list.every((n) => /^Classroom\s+/i.test(n))
    ? `Classroom ${nums.slice(0, -1).join(', ')} and ${nums.at(-1)}`
    : `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`;
}

/**
 * Home tiles for open sign-ups. A family gets one per child: "pick a time"
 * until they have one, then the time itself. A teacher gets one per classroom
 * they teach, and the office one per sign-up, each with how many have booked.
 */
export function SignupTiles({ signups, me }: { signups: Signup[]; me: Me }) {
  const isStaff = me.role === 'ADMIN' || me.role === 'TEACHER';
  const tiles: React.ReactNode[] = [];

  for (const s of signups.filter((x) => x.status !== 'DRAFT')) {
    const label = s.kind === 'CONFERENCE' ? 'Conference' : 'Observation';
    if (isStaff) {
      const rooms = me.role === 'ADMIN' ? [null] : s.classroomIds.filter((id) => me.teaches?.includes(id));
      for (const room of rooms) {
        const slots = s.slots.filter((x) => !room || x.classroomId === room);
        const seats = slots.reduce((n, x) => n + x.capacity, 0);
        const booked = slots.reduce((n, x) => n + x.booked, 0);
        tiles.push(
          <Tile key={`${s.eventId}-${room ?? 'all'}`} label={`${label} · ${room ? me.classroomNames[room] : roomsLabel(s.classroomIds, me.classroomNames)}`}>
            <p className="mt-1 text-lg font-bold text-ink">{s.title}</p>
            <p className="mt-0.5 text-sm text-muted">{booked} of {seats} booked{s.open ? '' : ' · sign-ups closed'}</p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
              <div className="h-full rounded-full bg-sage" style={{ width: `${seats ? (booked / seats) * 100 : 0}%` }} />
            </div>
            <Link href={`/signups/?event=${s.eventId}${room ? `&room=${room}` : ''}`} className="mt-auto self-start">
              <Button size="sm" variant="secondary">Open the sheet</Button>
            </Link>
          </Tile>,
        );
      }
      continue;
    }
    for (const child of s.children) {
      const held = s.slots.find((x) => x.slotId === child.slotId);
      const link = `/signups/?event=${s.eventId}&child=${child.childId}`;
      if (held) {
        // Booked: the card becomes the day itself.
        tiles.push(
          <Tile key={`${s.eventId}-${child.childId}`} label={`${label} day · ${child.firstName}`} tone="sage">
            <p className="mt-1 text-[22px] font-bold leading-tight">{formatShort(held.date)}</p>
            <p className="text-[18px] font-semibold">{clockRange(held.start, held.end)}</p>
            <p className="mt-1 text-[13px] text-white/85">{s.location} · {me.classroomNames[child.classroomId]}</p>
            {s.open && (
              <Link href={link} className="mt-auto self-start text-xs font-medium text-white underline underline-offset-2">Change time</Link>
            )}
          </Tile>,
        );
      } else if (s.open) {
        tiles.push(
          <Tile key={`${s.eventId}-${child.childId}`} label={s.title}>
            <p className="mt-1 text-lg font-bold text-ink">Pick a time for {child.firstName}</p>
            <p className="mt-0.5 text-sm text-muted">
              {me.classroomNames[child.classroomId]} · {s.slotMinutes} minutes{s.closesOn ? ` · by ${formatShort(s.closesOn)}` : ''}
            </p>
            <Link href={link} className="mt-auto self-start"><Button size="sm">Pick a time</Button></Link>
          </Tile>,
        );
      }
    }
  }
  return <>{tiles}</>;
}
