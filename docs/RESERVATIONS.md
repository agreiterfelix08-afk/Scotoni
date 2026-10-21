# Table reservations at Rifugio Scotoni: how it works

*For Christian and the team. A short version for guests is at the end.*

## The idea in one sentence

**One set of rules, the same for everyone, written down and visible.** Tables go to whoever books
first within those rules. Staff can still make exceptions, but every exception needs a reason and is
written into a log that only the owner can read.

Nobody has to argue at the door any more. "The system was full" and "that's the rule" are
easier to say than "I gave the table to someone else".

## The rules (all numbers can be changed in one file)

The numbers below are **examples** for the prototype. We set the real ones together (see
`docs/TODO-FOR-THE-HUT.md`).

| Rule | Example value | Why |
|---|---|---|
| Online bookings open | 60 days ahead | Fair to people planning their holiday |
| Online bookings for today close | 11:00 | After that the kitchen plans with who is there |
| Seats kept for walk-ins | 40 % of the stube, 50 % of the terrace | Hikers arrive without booking. The hut must never be 100 % booked online |
| Walk-in seats released online | 10:30 on the day, if still free | Nothing is wasted on quiet days |
| Table held for latecomers | 15 minutes | Clear, and the same for everyone |
| Free cancellation | up to 24 hours before | Later cancellations and no-shows are counted |
| Deposit | after 2 no-shows or late cancellations | Replaces discussions with a rule |
| Groups | 9 or more people → a request, we confirm personally | Big groups need planning |
| One booking per person per day | yes | Stops people reserving "just in case" |
| Waitlist | if a table frees up, the first person on the list gets a link and 30 minutes to confirm | First come, first served, automatically |
| Reserved area (premium) | minimum spend **€ X per person** (or a deposit) | See "The reserved area" |

**How tables are assigned:** the system always gives the **smallest table that fits** (or two to
three tables pushed together). A couple never blocks a table for six, and at peak times
(12:00–13:00) a small party never gets a big table.

**How long a table is taken:** 90 minutes for up to 4 people, 120 minutes for 5 or more.

## A Saturday lunch: an example

*It is a sunny Saturday in July. The terrace is open.*

1. **Bookings during the week.** Anna (2 people) books the terrace at 12:00. The Rossi family (4)
   books the stube at 12:30. Lukas books the reserved area for 4 people at 12:30. He sees the
   minimum spend on screen and ticks "I accept". A club writes for 12 people: this becomes a
   **request**, and Christian confirms it on Thursday.
2. **Friday evening.** All online terrace seats for 12:30 are gone. Maria still tries 12:30 and
   joins the **waitlist**. Then a booking for 12:30 is cancelled. Maria automatically gets an
   email: "a table is free, confirm within 30 minutes". She confirms. Nobody had to phone anyone.
3. **Saturday 10:30.** The seats held back for walk-ins are released online automatically, but only
   the ones that are still free. Today it is busy, so most of them are already planned for walk-ins.
4. **12:15, a group of 6 hikers arrives without booking.** They get a table from the walk-in seats.
   Staff add them with "Add walk-in" in two taps. No rule broken, nothing to explain.
5. **12:45, the Rossi family has not arrived.** After 15 minutes the booking shows "late". Staff
   mark a **no-show**. The table is free again, and the system offers it to the waitlist.
6. **A friend of the family calls** and wants a table at 13:00, which is full online. Staff *can* book
   it with an "override", but the system asks for a reason ("regular guest, called at 9:00"). The
   name of the staff member, the time and the reason go into the **audit log**. Exceptions are
   still possible, and now everyone can see them.
7. **13:10, a storm is coming.** One click on **"Rain: terrace closed"**. The system moves every
   terrace booking it can into the stube, and emails those guests. It also lists the bookings it
   **could not** move, so staff know exactly whom to talk to or call. ("Rain: covered tables only"
   keeps the covered part of the terrace open.)
8. **Evening.** Christian sees the day in numbers (covers, walk-ins, no-shows, reserved area), can
   export the day as a spreadsheet (CSV), and reads the audit log.

## The reserved area: fairness vs. revenue

The idea is a separate area for guests who want to spend more. The risk is that it looks like a
VIP area for friends. The system turns it into a **paid tier with a published rule**: anyone can book
it by accepting the stated minimum spend or deposit. Ordinary bookings never land there. Staff
moving someone into it without the rule counts as an override and needs a reason.

There are two models; choose one in the config:

| | Minimum spend | Deposit |
|---|---|---|
| How | Guest accepts "minimum € X per person"; checked when paying | Guest pays € X per person when booking; deducted from the bill |
| Pros | No payment system needed; friendly | No-shows cost the guest, not the hut; guaranteed revenue |
| Cons | Honour-based; awkward if someone spends less | Needs a payment provider and its fees; more friction on a weak connection |

**Trade-offs to decide together:**
- **How big?** More premium tables bring more revenue but fewer normal tables. That can feel unfair
  in a place known for "warmth over luxury". Start small (e.g. 2–3 tables) and look at the numbers.
- **Walk-in share.** A higher share is friendlier to hikers but brings in less certain revenue. A
  lower share does the opposite.
- **Overbooking** (booking slightly more than capacity because some people don't come) is **off**.
  It can be switched on later based on the real no-show rate. When it is on, it only uses up
  walk-in seats and never double-books a table.

## Who can do what

- **Staff**: see the day, add walk-ins, seat, finish, mark no-shows, move bookings, rain mode,
  block a table, close a zone, take phone bookings.
- **Owner**: everything above, plus the audit log, CSV export, and data protection tools (delete a
  guest's data on request, run the clean-up).
- **Privacy**: we keep only name, contact and booking details. After 12 months they are
  anonymised automatically; the numbers stay.

---

## Short version for guests (to print or put on the website)

> **Booking a table at Rifugio Scotoni: the same rules for everyone**
>
> - Book lunch online up to **60 days** ahead. Bookings for today close at **11:00**.
> - Tables go **in the order of booking**. There are no favourites.
> - We always keep **part of our seats for hikers without a booking**. If you didn't book, come
>   anyway!
> - We hold your table for **15 minutes**. Free cancellation up to **24 hours** before, using the
>   link in your email.
> - **Full?** Join the waitlist. If a table frees up, you get an email and have 30 minutes to
>   confirm it.
> - **Groups of 9 or more** send a request; we confirm personally.
> - **Reserved area:** anyone can book it with a minimum spend of **€ X per person** (stated when
>   you book).
> - **Bad weather:** if we have to close the terrace, we move you inside when we can, or contact
>   you.
> - After **2 no-shows** we ask for a deposit.
> - We store only what we need for your booking, and anonymise it after 12 months.
