"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AppNavPanel } from "@/components/app-nav-panel";
import { TextField } from "@/components/ui/text-field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2, Calculator, RotateCcw } from "lucide-react";
import { HeaderAvatar } from "@/components/header-avatar";
import { NotificationBell } from "@/components/notification-bell";

type Course = {
  id: number;
  name: string;
  units: string;
  grade: string;
};

// Grading systems. Each scale maps a grade label to a numeric point value.
// - Philippine: 1.00 (highest) to 5.00 (failing). Lower GWA = better.
// - US 4.0: A+ (4.0) highest to F (0). Higher GWA = better.
// - Numeric 4.0: 4.0 (highest) to 1.0 (lowest). Higher GWA = better.
// INC/DRP/FA don't carry grade points.
type GradingScale = {
  id: string;
  label: string;
  defaultGrade: string;
  lowerIsBetter: boolean;
  minPoint: number;
  maxPoint: number;
  points: Record<string, number>;
};

const GRADING_SCALES: Record<string, GradingScale> = {
  philippine: {
    id: "philippine",
    label: "Philippine 1.00–5.00",
    defaultGrade: "2.00",
    lowerIsBetter: true,
    minPoint: 1,
    maxPoint: 5,
    points: {
      "1.00": 1.0,
      "1.25": 1.25,
      "1.50": 1.5,
      "1.75": 1.75,
      "2.00": 2.0,
      "2.25": 2.25,
      "2.50": 2.5,
      "2.75": 2.75,
      "3.00": 3.0,
      "5.00": 5.0,
      "INC": 0,
      "DRP": 0,
      "FA": 0,
    },
  },
  us4: {
    id: "us4",
    label: "US 4.0 (A–F)",
    defaultGrade: "B",
    lowerIsBetter: false,
    minPoint: 0,
    maxPoint: 4,
    points: {
      "A+": 4.0,
      "A": 4.0,
      "A-": 3.7,
      "B+": 3.3,
      "B": 3.0,
      "B-": 2.7,
      "C+": 2.3,
      "C": 2.0,
      "C-": 1.7,
      "D+": 1.3,
      "D": 1.0,
      "D-": 0.7,
      "F": 0,
      "INC": 0,
      "DRP": 0,
    },
  },
  numeric4: {
    id: "numeric4",
    label: "Numeric 4.0 (4 = highest)",
    defaultGrade: "3.0",
    lowerIsBetter: false,
    minPoint: 1,
    maxPoint: 4,
    points: {
      "4.0": 4.0,
      "3.5": 3.5,
      "3.0": 3.0,
      "2.5": 2.5,
      "2.0": 2.0,
      "1.5": 1.5,
      "1.0": 1.0,
      "INC": 0,
      "DRP": 0,
    },
  },
};

let nextId = 1;

export default function GWACalculatorPage() {
  const [scaleId, setScaleId] = useState<string>("philippine");
  const scale = GRADING_SCALES[scaleId]!;
  const GRADE_POINTS = scale.points;
  const GRADE_OPTIONS: string[] = Object.keys(scale.points);

  const [courses, setCourses] = useState<Course[]>(() => defaultCourses());

  function defaultCourses(): Course[] {
    return [
      { id: nextId++, name: "", units: "3", grade: scale.defaultGrade },
      { id: nextId++, name: "", units: "3", grade: scale.defaultGrade },
      { id: nextId++, name: "", units: "3", grade: scale.defaultGrade },
    ];
  }
  const [targetGWA, setTargetGWA] = useState("");
  const [currentGWA, setCurrentGWA] = useState("");
  const [currentUnits, setCurrentUnits] = useState("");

  function addCourse() {
    setCourses((prev) => [...prev, { id: nextId++, name: "", units: "3", grade: scale.defaultGrade }]);
  }

  function removeCourse(id: number) {
    setCourses((prev) => prev.filter((c) => c.id !== id));
  }

  function updateCourse(id: number, field: keyof Course, value: string) {
    setCourses((prev) => prev.map((c) => (c.id === id ? { ...c, [field]: value } : c)));
  }

  function resetAll() {
    nextId = 1;
    setCourses(defaultCourses());
    setTargetGWA("");
    setCurrentGWA("");
    setCurrentUnits("");
  }

  function handleScaleChange(nextIdVal: string) {
    const next = GRADING_SCALES[nextIdVal]!;
    setScaleId(nextIdVal);
    // Remap any grade that doesn't exist in the new scale to its default.
    setCourses((prev) =>
      prev.map((c) => ({
        ...c,
        grade: next.points[c.grade] !== undefined ? c.grade : next.defaultGrade,
      }))
    );
    setTargetGWA("");
    setCurrentGWA("");
  }

  const totalUnits = courses.reduce((sum, c) => sum + (parseFloat(c.units) || 0), 0);
  const totalGradePoints = courses.reduce(
    (sum, c) => sum + (parseFloat(c.units) || 0) * (GRADE_POINTS[c.grade] ?? 0),
    0
  );
  const gwa = totalUnits > 0 ? (totalGradePoints / totalUnits).toFixed(2) : "0.00";

  // Cumulative GWA
  const cumUnits = (parseFloat(currentUnits) || 0) + totalUnits;
  const cumGradePoints =
    (parseFloat(currentGWA) || 0) * (parseFloat(currentUnits) || 0) + totalGradePoints;
  const cumulativeGWA = cumUnits > 0 ? (cumGradePoints / cumUnits).toFixed(2) : "0.00";

  // Required grade calculation (lower is better — target must be >= 1.00)
  const target = parseFloat(targetGWA) || 0;

  return (
    <div className="mx-auto w-full max-w-6xl pt-4 md:pt-0">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 sm:mb-8">
        <div className="flex items-start gap-3">
          <HeaderAvatar />
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              GWA Calculator
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Compute your semester and cumulative GWA (General Weighted Average).
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {/* Labelled visually rather than only via aria-label. This picklist decides
              whether 5.00 is best or worst, so getting it wrong silently flips
              every number on the page — it needs to be readable as a control,
              not guessed at. */}
          <div className="flex items-center gap-2">
            <span className="hidden text-sm text-muted-foreground sm:inline">Scale</span>
            <select
              value={scaleId}
              onChange={(e) => handleScaleChange(e.target.value)}
              className="h-9 rounded-lg border-2 border-foreground/70 bg-card px-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
              aria-label="Grading system"
            >
              {Object.values(GRADING_SCALES).map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </div>
          <Button variant="outline" size="sm" onClick={resetAll}>
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            Reset
          </Button>
          <NotificationBell variant="inline" className="hidden md:flex" />
        </div>
      </div>

      <div className="flex flex-col gap-6 md:flex-row md:items-start">

        <AppNavPanel />
        <div className="min-w-0 flex-1 mx-auto w-full max-w-6xl space-y-6">
      {/* Previous GWA */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Previous Semester (Optional)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            <TextField
              label="Previous GWA"
              type="number"
              step="0.01"
              min={scale.minPoint}
              max={scale.maxPoint}
              value={currentGWA}
              onChange={(e) => setCurrentGWA(e.target.value)}
            />
            <TextField
              label="Total Units Earned"
              type="number"
              min="0"
              value={currentUnits}
              onChange={(e) => setCurrentUnits(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Course List */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            This Semester ({courses.length} courses)
          </CardTitle>
          <Button variant="outline" size="sm" onClick={addCourse} className="h-8">
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add Course
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {courses.map((course) => (
            <div
              key={course.id}
              className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-lg border border-border/40 p-2 sm:grid-cols-[1fr_80px_100px_36px] sm:gap-2 sm:rounded-none sm:border-0 sm:p-0"
            >
              <TextField
                label="Course name"
                value={course.name}
                onChange={(e) => updateCourse(course.id, "name", e.target.value)}
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-muted-foreground hover:text-destructive sm:hidden"
                onClick={() => removeCourse(course.id)}
                disabled={courses.length <= 1}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
              <TextField
                label="Units"
                type="number"
                min="0"
                step="0.5"
                value={course.units}
                onChange={(e) => updateCourse(course.id, "units", e.target.value)}
              />
              <select
                value={course.grade}
                onChange={(e) => updateCourse(course.id, "grade", e.target.value)}
                className="h-9 rounded-lg border border-input bg-card px-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
              >
                {GRADE_OPTIONS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
              <Button
                variant="ghost"
                size="icon"
                className="hidden h-9 w-9 text-muted-foreground hover:text-destructive sm:inline-flex"
                onClick={() => removeCourse(course.id)}
                disabled={courses.length <= 1}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Results */}
      <div className="grid items-stretch gap-4 sm:grid-cols-3">
        <Card className="bg-primary/5">
          <CardContent className="flex h-full flex-col items-center justify-center pt-6 pb-4">
            <Calculator className="mb-2 h-5 w-5 text-primary" />
            <p className="text-xs text-muted-foreground">Semester GWA</p>
            <p className="text-3xl font-bold text-primary">{gwa}</p>
            <p className="text-xs text-muted-foreground">{totalUnits} units</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex h-full flex-col items-center justify-center pt-6 pb-4">
            <Calculator className="mb-2 h-5 w-5 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Cumulative GWA</p>
            <p className="text-3xl font-bold text-foreground">{cumulativeGWA}</p>
            <p className="text-xs text-muted-foreground">{cumUnits} total units</p>
          </CardContent>
        </Card>

        {/* Sibling of the two read-only result cards, so it shares their height
            instead of stretching to the full row when the "needed GWA" line
            appears below the field. */}
        <Card className="h-full">
          <CardContent className="flex h-full flex-col justify-center space-y-3 pt-6 pb-4">
            <TextField
              label="Target GWA"
              inputClassName="text-center text-lg font-bold"
              type="number"
              step="0.01"
              min={scale.minPoint}
              max={scale.maxPoint}
              value={targetGWA}
              onChange={(e) => setTargetGWA(e.target.value)}
            />
            {target > 0 && parseFloat(currentGWA) > 0 && (
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Needed GWA this sem:</p>
                <p className="text-lg font-bold text-foreground">
                  {(() => {
                    const needed = (target * cumUnits - cumGradePoints + totalGradePoints) / totalUnits;
                    if (scale.lowerIsBetter) {
                      return needed < scale.minPoint ? "Not possible" : needed > scale.maxPoint ? "Already achieved!" : needed.toFixed(2);
                    }
                    return needed > scale.maxPoint ? "Not possible" : needed < scale.minPoint ? "Already achieved!" : needed.toFixed(2);
                  })()}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
        </div>
      </div>
    </div>
  );
}