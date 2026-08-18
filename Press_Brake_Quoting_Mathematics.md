# Press Brake Quoting Engine — Complete Mathematics & Logic

## For FileMaker Implementation Reference
**Version**: Enhanced Engine v2 (December 2025)
**Author**: Nestix ERP System

---

## OVERVIEW

The Press Brake quoting engine calculates the **labour cost per part** by estimating the total time (in seconds) required to form each part, then converting that time into a dollar cost using the operator's hourly rate.

### Master Formula (Summary)

```
COST PER PART = (Total Labour Time in seconds / 3600) x Hourly Rate + (Setup Cost / Quantity)
```

Where **Total Labour Time** is built up from 12 calculation steps below.

---

## INPUT VARIABLES

| Variable | Description | Example | Default |
|---|---|---|---|
| Bend Length (mm) | Length of the longest bend | 1200 | 0 |
| Number of Bends | Total bends per part | 4 | 0 |
| Thickness (mm) | Material thickness | 6 | 3 |
| Part Weight (kg) | Weight of one part | 12 | 0 |
| Flips per Part | Times part must be flipped during forming | 2 | 0 |
| Geometry Type | Shape classification | flange / channel / hat / z-bend / box / complex | flange |
| Difficulty Level | Operator skill required | simple / moderate / complex | simple |
| V-Die Override (mm) | Manual V-die size (optional) | 48 | auto-calculated |
| Packing Time (sec) | Time to pack one part | 10 | 0 |
| Efficiency Factor (%) | Shop floor buffer for real-world delays | 10 | 10 |
| Hourly Rate ($) | Press brake operator rate | 100 | 100 |
| Setup Time (min) | Machine setup time | 45 | 0 |
| Setup Unit | Unit of setup time | Minutes / Hours | Minutes |
| Seconds Override | Manual override for total time per part | 0 | not used |
| Quantity | Number of parts to produce | 1000 | 1 |

---

## THE 12-STEP CALCULATION

### STEP 1: Base Bend Time (seconds per bend)

Based on **bend length** — longer bends take longer because the operator must guide more material.

| Bend Length | Base Bend Time |
|---|---|
| 0 - 500 mm | **15 seconds** |
| 501 - 1000 mm | **20 seconds** |
| 1001 - 2000 mm | **30 seconds** |
| Over 2000 mm | **45 seconds** |

**Logic**: Short parts can be positioned quickly. Long parts require careful alignment and often need the operator to walk along the machine.

---

### STEP 2: Thickness Modifier

Thicker material is harder to bend — requires more force, slower ram speed, and more careful positioning.

| Thickness | Factor | Reasoning |
|---|---|---|
| 0 - 2 mm | **1.00** (no penalty) | Standard thin sheet — easy to form |
| 2.1 - 6 mm | **1.15** (+15%) | Medium gauge — slightly slower, more springback |
| 6.1 - 10 mm | **1.30** (+30%) | Heavy gauge — significant force needed, slower positioning |
| Over 10 mm | **1.50** (+50%) | Plate work — very slow, high tonnage, careful handling |

---

### STEP 3: V-Die Selection & Modifier

#### 3a. V-Die Size Calculation (the "8x Rule")

The V-die opening is typically **8 times the material thickness**:

```
V-Die = Thickness x 8
```

| Thickness | Calculated V-Die |
|---|---|
| 1.5 mm | 12 mm |
| 3 mm | 24 mm |
| 6 mm | 48 mm |
| 10 mm | 80 mm |

**Why 8x?** This is the industry-standard ratio for air bending. It provides:
- Clean bend radius (approx. 1.2 x V-die opening / 6)
- Minimum required tonnage
- Acceptable springback behaviour

**Manual Override**: The operator can override this (e.g., using a smaller V-die for a tighter radius, or larger for reduced tonnage). If overridden, use the manual value instead.

#### 3b. V-Die Speed Factor

Larger V-dies require slower ram speed and more careful alignment:

| V-Die Size | Factor | Reasoning |
|---|---|---|
| 0 - 12 mm | **1.00** | Small die — fast, standard operation |
| 13 - 24 mm | **1.10** (+10%) | Medium die — slightly more care needed |
| 25 - 40 mm | **1.20** (+20%) | Large die — slower approach, heavier tooling |
| Over 40 mm | **1.35** (+35%) | Very large die — slow, heavy, requires precision |

---

### STEP 4: Modified Bend Time

Combine the base bend time with both modifiers:

```
Bend Time = Base Bend Time x Thickness Factor x V-Die Factor
```

**Example**: 1200mm bend, 6mm thick, V-die = 48mm
- Base Bend Time = 20 sec (501-1000mm range... wait, 1200mm is in 1001-2000mm = 30 sec)
- Thickness Factor = 1.30 (6.1-10mm... wait, 6mm is exactly 6, so it's in the 2.1-6mm range = 1.15)

Let me redo: 1200mm bend, 6mm thick, V-die = 48mm
- Base Bend Time = **30 sec** (1001-2000mm)
- Thickness Factor = **1.15** (2.1-6mm)
- V-Die Factor = **1.20** (25-40mm... wait, V-die=48mm is >40 = **1.35**)

```
Bend Time = 30 x 1.15 x 1.35 = 46.575 seconds per bend
```

---

### STEP 5: Forming Time

Total time for all bends on the part:

```
Forming Time = Bend Time x Number of Bends
```

**Example**: 4 bends at 46.575 sec each = **186.3 seconds**

---

### STEP 6: Weight Handling Adjustment

Heavy parts slow down the operator — loading, positioning, and unloading take longer.

| Part Weight | Handling Time Added | Reasoning |
|---|---|---|
| 0 - 5 kg | **0 seconds** | Light — easy to manoeuvre by hand |
| 5.1 - 10 kg | **+5 seconds** | Moderate — needs careful lifting |
| 10.1 - 15 kg | **+10 seconds** | Heavy — slower positioning |
| 15.1 - 25 kg | **+20 seconds** | Very heavy — may need crane/hoist |
| Over 25 kg | **+30 seconds** | Requires lifting equipment, very slow |

---

### STEP 7: Flip Time

When a part requires flipping between bends (e.g., bending opposite edges), it takes time. Flip time depends on bend length (longer = harder to flip).

| Bend Length | Time per Flip | Reasoning |
|---|---|---|
| 0 - 500 mm | **3 seconds** | Small part — quick hand flip |
| 501 - 1200 mm | **5 seconds** | Medium — needs repositioning |
| 1201 - 2000 mm | **8 seconds** | Large — careful rotation needed |
| Over 2000 mm | **12 seconds** | Very large — may need 2 people |

```
Total Flip Time = Flips per Part x Time per Flip
```

**Example**: 2 flips on 1200mm part = 2 x 5 = **10 seconds**

---

### STEP 8: Geometry Type Classification

This is a **classification** field only — it feeds into Step 9 (Box Penalty). The types are:

| Geometry | Description | Has Box Penalty? |
|---|---|---|
| **Flange** | Simple L-shape, one or more parallel bends | No |
| **Channel** | U-shape (C-channel) | No |
| **Hat** | Hat section / top-hat profile | No |
| **Z-Bend** | Z-shaped offset bends | No |
| **Box** | 4-sided closed box or tray | **Yes** |
| **Complex** | Irregular multi-axis bending | **Yes** |

---

### STEP 9: Last Bend Box Penalty

For **box** and **complex** geometry, the last bend is significantly harder because the already-formed sides obstruct access. The penalty is **50% of one modified bend time**.

```
IF Geometry = "box" OR Geometry = "complex":
    Last Bend Penalty = Bend Time x 0.50
ELSE:
    Last Bend Penalty = 0
```

**Why 50%?** The last bend on a box requires:
- Tilting the part to clear existing walls
- Slower ram approach to avoid collision
- Often manual gauging (back gauge can't reach)

**Example**: Bend Time = 46.575 sec, Geometry = "box"
```
Last Bend Penalty = 46.575 x 0.5 = 23.29 seconds
```

---

### STEP 10: Total Part Time

Sum all time components:

```
Part Time = Forming Time + Handling Time + Flip Time + Last Bend Penalty
```

**Example**:
```
Part Time = 186.3 + 10 + 10 + 23.29 = 229.59 seconds
```

---

### STEP 11: Difficulty Factor

An overall multiplier reflecting the job's complexity beyond pure geometry:

| Difficulty | Factor | When to Use |
|---|---|---|
| **Simple** | **1.0** | Standard bends, good tolerances, no special requirements |
| **Moderate** | **1.2** (+20%) | Some tight tolerances, multiple tools, awkward handling |
| **Complex** | **1.5** (+50%) | Very tight tolerances, multiple setups, trial bends needed |

```
Adjusted Time = Part Time x Difficulty Factor
```

**Example**: Complex difficulty
```
Adjusted Time = 229.59 x 1.5 = 344.39 seconds
```

---

### STEP 12: Second Operator Rule

If the part is too heavy or too long, a second operator is required. This **doubles** the labour cost (two people's time).

```
IF Part Weight > 15 kg OR Bend Length > 2000 mm:
    Operator Multiplier = 2
ELSE:
    Operator Multiplier = 1
```

```
Total Labour Time = Adjusted Time x Operator Multiplier
```

---

## FINAL COST CALCULATION

### A. Add Packing Time

```
Total Time with Packing = Total Labour Time + Packing Time (seconds)
```

### B. Apply Efficiency Factor (Shop Floor Reality Buffer)

Default is 10%. This accounts for:
- Checking measurements between parts
- Material handling between batches
- Tool wear adjustments
- Operator fatigue

```
Final Time per Part = Total Time with Packing x (1 + Efficiency Factor / 100)
```

**Example**: Efficiency = 10%
```
Final Time per Part = (344.39 + 10) x 1.10 = 390.83 seconds
```

### C. Convert to Cost

```
Time in Hours = Final Time per Part / 3600
Labour Cost per Part = Time in Hours x Hourly Rate
```

**Example**: Hourly Rate = $100
```
Labour Cost per Part = (390.83 / 3600) x 100 = $10.86 per part
```

### D. Add Setup Cost (distributed across all parts)

```
Setup Cost = Setup Time (converted to hours) x Hourly Rate
Cost per Part (with setup) = Labour Cost per Part + (Setup Cost / Quantity)
```

**Example**: Setup = 45 min, Qty = 100
```
Setup Cost = (45/60) x 100 = $75.00
Cost per Part = $10.86 + ($75 / 100) = $10.86 + $0.75 = $11.61
```

### E. Optional Markup Adjustments (checkbox toggles)

| Adjustment | Percentage | When Applied |
|---|---|---|
| Stainless Steel | **+15%** | Material is stainless (harder on tooling, more springback) |
| Complex Bends | **+10%** | Compound angles, acute bends |
| Multiple Setups | **+15%** | Part requires tooling changes mid-run |
| Tight Tolerance | **+10%** | Tolerances tighter than standard (+/- 0.5mm) |

These are **cumulative** and applied to the total cost:

```
Total Adjustment = sum of all applicable percentages
Final Total Cost = (Setup Cost + Labour Cost x Qty) x (1 + Total Adjustment / 100)
Final Cost per Part = Final Total Cost / Quantity
```

---

## MANUAL OVERRIDE

If the operator knows the exact time per part (e.g., from a previous run), they can enter a **Seconds Override** which bypasses Steps 1-12 entirely:

```
IF Seconds Override > 0:
    Final Time per Part = Seconds Override
    (skip all 12 steps)
```

---

## COMPLETE WORKED EXAMPLE

**Job**: 200 x Stainless Steel trays, 1500mm long, 4mm thick, 6 bends, 2 flips, box geometry, moderate difficulty, 8kg each

| Step | Calculation | Result |
|---|---|---|
| 1. Base Bend Time | 1500mm -> 1001-2000 range | **30 sec** |
| 2. Thickness Factor | 4mm -> 2.1-6mm range | **1.15** |
| 3a. V-Die Size | 4 x 8 | **32mm** |
| 3b. V-Die Factor | 32mm -> 25-40 range | **1.20** |
| 4. Bend Time | 30 x 1.15 x 1.20 | **41.40 sec** |
| 5. Forming Time | 41.40 x 6 bends | **248.40 sec** |
| 6. Handling Time | 8kg -> 5.1-10kg range | **+5 sec** |
| 7. Flip Time | 2 flips x 8 sec (1201-2000mm) | **+16 sec** |
| 8. Geometry | Box | (triggers penalty) |
| 9. Box Penalty | 41.40 x 0.5 | **+20.70 sec** |
| 10. Part Time | 248.40 + 5 + 16 + 20.70 | **290.10 sec** |
| 11. Difficulty | Moderate (x1.2) | **348.12 sec** |
| 12. 2nd Operator | 8kg < 15kg, 1500mm < 2000mm | **x1 (no)** |
| Packing | +10 sec | **358.12 sec** |
| Efficiency | x 1.10 (10% buffer) | **393.93 sec** |
| **Labour/Part** | (393.93 / 3600) x $100 | **$10.94** |
| Setup | 45 min = $75.00 / 200 parts | **+$0.38** |
| Subtotal/Part | $10.94 + $0.38 | **$11.32** |
| Stainless Markup | +15% | **$13.02** |
| **FINAL COST/PART** | | **$13.02** |
| **TOTAL JOB COST** | $13.02 x 200 | **$2,603.00** |

---

## V-DIE SELECTION GUIDE (Reference for FileMaker Dropdown)

| Thickness (mm) | Recommended V-Die (8x rule) | Min Tonnage/m (approx) |
|---|---|---|
| 0.5 | 4 | 1.5 t/m |
| 1.0 | 8 | 6 t/m |
| 1.5 | 12 | 14 t/m |
| 2.0 | 16 | 22 t/m |
| 3.0 | 24 | 50 t/m |
| 4.0 | 32 | 88 t/m |
| 5.0 | 40 | 138 t/m |
| 6.0 | 48 | 200 t/m |
| 8.0 | 64 | 355 t/m |
| 10.0 | 80 | 555 t/m |
| 12.0 | 96 | 800 t/m |

---

## QUANTITY PRICE BREAKS

The system also calculates price breaks for different quantities. The only thing that changes is how the **setup cost is distributed**:

```
For each quantity Q:
    Price per Part at Q = Labour Cost per Part + (Setup Cost / Q)
    Total at Q = Price per Part x Q
```

| Quantity | Setup/Part ($75 setup) | Labour/Part | Total/Part |
|---|---|---|---|
| 10 | $7.50 | $10.94 | $18.44 |
| 50 | $1.50 | $10.94 | $12.44 |
| 100 | $0.75 | $10.94 | $11.69 |
| 500 | $0.15 | $10.94 | $11.09 |
| 1000 | $0.075 | $10.94 | $11.02 |

---

## FILEMAKER IMPLEMENTATION NOTES

1. **All times are in SECONDS** throughout the calculation
2. **Convert to hours only at the final cost step** (divide by 3600)
3. **The V-Die auto-calculation** (thickness x 8) should pre-fill but allow manual override
4. **Efficiency Factor** defaults to 10% — this is the "fudge factor" for real-world conditions
5. **Markups are cumulative** — stainless + tight tolerance = +25%, not +15% then +10%
6. **Second Operator doubles the COST**, not the time displayed (though effectively it's the same since 2 operators = 2x the hourly cost)
7. **Setup Cost is ONE-TIME** regardless of quantity — it gets divided across all parts
