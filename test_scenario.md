# PhiLogg demo — test scenarios

Fifteen tasks that walk a first-time user through PhiLogg's most common and
most useful features. They are invitations to explore, not challenges: each
one names a goal, never the steps or the controls. Work them in order —
later tasks may build on earlier ones.

**Data:** the homepage demo log, `tour/demo/app.log` (log simulator `-f tour`,
2,500 entries of a fictional shop/machine backend). **Run by an agent:** the
`usability-test` skill (`.claude/skills/usability-test/`) drives these tasks in
desktop, tablet or phone mode and reports what worked and what didn't.

1. **Get your bearings.** Open the demo log and find out how many entries it
   has, which time span it covers and how the entries split across log levels.
   *Done when:* you can state the entry count, first/last timestamp and the
   number of errors.

2. **Focus on what went wrong.** Reduce the view to errors and warnings only,
   then get back to seeing everything.
   *Done when:* only ERROR/WARN (and FATAL) entries were shown at one point,
   and the full log is visible again afterwards.

3. **Read an error in full.** Pick an error that comes with a stack trace and
   read its complete text, including the lines a single row cuts off. Compare
   the different ways the app can present the same entry.
   *Done when:* you have read the innermost exception of one stack trace.

4. **Follow one problem.** Keep only the entries about failed database
   connections and find out how often that happened.
   *Done when:* a lasting filter for it exists and you know the count.

5. **Narrow it down.** Within those database failures, find out which thread
   reports them most often and look at just that thread's failures.
   *Done when:* the narrower result is shown as a step below the previous one.

6. **Silence the noise.** Make the routine heartbeat messages disappear from
   your view without losing anything else.
   *Done when:* no "Heartbeat OK" entry is visible and every other entry still is.

7. **See what happened around it.** For one of the database failures, look at
   the entries that were logged just before and after it in the full log,
   without throwing away your filter.
   *Done when:* you saw the neighbors of a filtered entry and can still return
   to the filtered list.

8. **Search without filtering.** Look for the word "timeout" in the current
   view and step from one occurrence to the next without changing which
   entries are shown.
   *Done when:* you jumped through at least three hits and the view still
   shows the same entries as before.

9. **Mark what matters.** Mark two interesting entries so you can find them
   again later, and attach a short note to one of them. Then call up just the
   marked entries.
   *Done when:* both entries are shown together and the note is visible.

10. **Zoom into a burst.** The log has short bursts of many warnings and
    errors. Find one and restrict the view to the time window around it.
    *Done when:* the view covers only a few seconds around the burst.

11. **Spot the most common messages.** Find out which kind of message the log
    contains most often, ignoring the numbers and IDs that differ between
    otherwise identical lines.
    *Done when:* you can name the most frequent message shape and its count.

12. **Who is talking?** Find out which threads and source locations produce
    the warnings, and which one produces the most.
    *Done when:* you can name the top thread with its warning count.

13. **Turn text into numbers.** Pull the temperature values of sensor T1 out
    of its messages into a table and plot them over time. Is there an
    outlier?
    *Done when:* a chart of T1's temperature over time is on screen.

14. **Measure how long things take.** Every "Move requested" is normally
    followed by a "Position reached" for the same axis. Pair them up and find
    the slowest move and any move that never finished.
    *Done when:* you can name the longest move duration and one unfinished move.

15. **Undo, go back, take it with you.** Delete one of your filters by mistake
    and bring it back, return to a view you looked at earlier, and finally
    save or share your work so a colleague could open the same filters.
    *Done when:* the deleted filter is back, an earlier view was revisited via
    navigation, and a file or link with your filters exists.
