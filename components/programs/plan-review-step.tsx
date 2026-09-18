'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, Pencil, Sparkles, Check } from 'lucide-react'
import type { ClinicalPlan, WeekPlan } from '@/lib/ai/types/program-generation'
import { StatusBadge } from '@/components/shared/status-badge'
import type { StatusRole } from '@/lib/ui/status'

const REHAB_STAGE_LABELS: Record<string, { label: string; role: StatusRole }> = {
  EARLY_REHAB: { label: 'Early Rehab', role: 'info' },
  MID_REHAB: { label: 'Mid Rehab', role: 'warning' },
  LATE_REHAB: { label: 'Late Rehab', role: 'success' },
  MAINTENANCE: { label: 'Maintenance', role: 'brand' },
  BASE_BUILD: { label: 'Base Build', role: 'info' },
  BUILD: { label: 'Build', role: 'warning' },
  PEAK: { label: 'Peak', role: 'success' },
  TAPER: { label: 'Taper', role: 'warning' },
  GENERAL_FITNESS: { label: 'General Fitness', role: 'brand' },
}

interface PlanReviewStepProps {
  plan: ClinicalPlan
  onConfirm: (updatedPlan: ClinicalPlan) => void
  onBack: () => void
  isGenerating: boolean
}

export function PlanReviewStep({ plan, onConfirm, onBack, isGenerating }: PlanReviewStepProps) {
  const [weeklyPlan, setWeeklyPlan] = useState<WeekPlan[]>(plan.weeklyPlan)
  const [editingWeek, setEditingWeek] = useState<number | null>(null)
  const [editGuidance, setEditGuidance] = useState('')
  const [editGoal, setEditGoal] = useState('')
  const [editAvoid, setEditAvoid] = useState('')

  function startEdit(week: WeekPlan) {
    setEditingWeek(week.week)
    setEditGuidance(week.clinicalGuidance)
    setEditGoal(week.progressionGoal)
    setEditAvoid(week.contraindicationsThisWeek.join(', '))
  }

  function saveEdit(weekNumber: number) {
    setWeeklyPlan(prev =>
      prev.map(w => w.week === weekNumber ? {
        ...w,
        clinicalGuidance: editGuidance,
        progressionGoal: editGoal,
        contraindicationsThisWeek: editAvoid
          .split(/[\n,]/)
          .map(value => value.trim())
          .filter(Boolean),
      } : w)
    )
    setEditingWeek(null)
  }

  function handleConfirm() {
    onConfirm({ ...plan, weeklyPlan })
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold">{plan.programMode === 'PERFORMANCE' ? 'Training Program Plan' : 'Clinical Program Plan'}</h3>
        <p className="text-sm text-muted-foreground mt-1">{plan.clinicalAssessment}</p>
      </div>

      <div className="space-y-2">
        {weeklyPlan.map(week => {
          const stage = REHAB_STAGE_LABELS[week.rehabStage] ?? { label: week.rehabStage, role: 'neutral' as StatusRole }
          const isEditing = editingWeek === week.week

          return (
            <Card key={week.week} className="border">
              <CardContent className="pt-3 pb-3 px-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">Week {week.week} — {week.title}</span>
                      <StatusBadge
                        status={week.rehabStage}
                        role={stage.role}
                        label={stage.label}
                        dot={false}
                        size="sm"
                      />
                      <span className="text-xs text-muted-foreground">· {week.difficultyLevel}</span>
                    </div>

                    {isEditing ? (
                      <div className="mt-2 space-y-2">
                        <label className="text-xs font-medium text-muted-foreground">Clinical guidance</label>
                        <Textarea
                          value={editGuidance}
                          onChange={e => setEditGuidance(e.target.value)}
                          rows={3}
                          className="text-sm"
                        />
                        <label className="text-xs font-medium text-muted-foreground">Goal</label>
                        <Textarea
                          value={editGoal}
                          onChange={e => setEditGoal(e.target.value)}
                          rows={2}
                          className="text-sm"
                          placeholder="Goal"
                          aria-label="Goal"
                        />
                        <label className="text-xs font-medium text-muted-foreground">What to avoid</label>
                        <Textarea
                          value={editAvoid}
                          onChange={e => setEditAvoid(e.target.value)}
                          rows={2}
                          className="text-sm"
                          placeholder="What to avoid"
                          aria-label="What to avoid"
                        />
                        <Button size="sm" variant="outline" onClick={() => saveEdit(week.week)}>
                          <Check className="h-3 w-3 mr-1" /> Save
                        </Button>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground mt-1">{week.clinicalGuidance}</p>
                    )}

                    <p className="text-xs text-muted-foreground mt-1">
                      <span className="font-medium text-foreground">Goal:</span> {week.progressionGoal}
                    </p>

                    <p className="text-xs text-danger-foreground mt-1">
                      <span className="font-medium">{week.programMode === 'PERFORMANCE' ? 'Watch:' : 'Avoid:'}</span>{' '}
                      {week.contraindicationsThisWeek.length > 0 ? week.contraindicationsThisWeek.join(', ') : 'None specified'}
                    </p>
                  </div>

                  {!isEditing && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 shrink-0 text-muted-foreground"
                      onClick={() => startEdit(week)}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="flex justify-between gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onBack} disabled={isGenerating}>
          ← Back
        </Button>
        <Button onClick={handleConfirm} disabled={isGenerating}>
          {isGenerating ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Generating Exercises...
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              Generate Exercises
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
