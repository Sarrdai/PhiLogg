// The Entry detail panel has nothing to show here, so it is collapsed.
toggleDetailCollapsed(true);
show(S.position, "plot");
click('#plotTypeRow [data-type="scatter"]');
pick("#plotXSelect", "x (");
pick("#plotYSelectSingle", "y (");
pick("#plotColorSelect", "t (ms)");
click("#plotAxisEqual");
