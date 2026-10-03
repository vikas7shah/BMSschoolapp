'use client';

import Link from 'next/link';
import { formatShort } from '@bms/shared';
import type { Me, Signup } from '@/lib/api';
import { clockRange } from '@/lib/time';
import { Button, Tile } from './ui';

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
          <Tile key={`${s.eventId}-${room ?? 'all'}`} label={`${label} · ${room ? me.classroomNames[room] : 'all classrooms'}`}>
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
        tiles.push(
          <Tile key={`${s.eventId}-${child.childId}`} label={`Your ${label.toLowerCase()} · ${child.firstName}`}>
            <p className="mt-1 text-[19px] font-bold leading-tight text-ink">{formatShort(held.date)}</p>
            <p className="text-[17px] font-semibold text-sage-dark">{clockRange(held.start, held.end)}</p>
            <p className="mt-1 text-sm text-muted">{s.location} · {me.classroomNames[child.classroomId]}</p>
            {s.open && (
              <Link href={link} className="mt-auto self-start text-xs font-medium text-sage underline underline-offset-2">Change time</Link>
            )}
          </Tile>,
        );
      } else if (s.open) {
        tiles.push(
          <Tile key={`${s.eventId}-${child.childId}`} label={`${s.title} · ${child.firstName}`} tone="sage">
            <p className="mt-1 text-lg font-bold">Pick a time for {child.firstName}</p>
            <p className="mt-0.5 text-[13px] text-white/85">
              {s.location} · {me.classroomNames[child.classroomId]} · {s.slotMinutes} min
            </p>
            {s.closesOn && <p className="text-[13px] text-white/75">Sign up by {formatShort(s.closesOn)}</p>}
            <Link href={link} className="mt-auto self-start"><Button size="sm" variant="secondary">Pick a time</Button></Link>
          </Tile>,
        );
      }
    }
  }
  return <>{tiles}</>;
}
