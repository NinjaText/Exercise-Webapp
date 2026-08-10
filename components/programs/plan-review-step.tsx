'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, Pencil, Sparkles, Check } from 'lucide-react'
import type { ClinicalPlan, WeekPlan } from '@/lib/ai/types/program-generation'

const REHAB_STAGE_LABELS: Record<string, { label: string; color: string }> = {
  EARLY_REHAB: { label: 'Early Rehab', color: 'bg-blue-100 text-blue-800' },
  MID_REHAB: { label: 'Mid Rehab', color: 'bg-yellow-100 text-yellow-800' },
  LATE_REHAB: { label: 'Late Rehab', color: 'bg-green-100 text-green-800' },
  MAINTENANCE: { label: 'Maintenance', color: 'bg-purple-100 text-purple-800' },
  BASE_BUILD: { label: 'Base Build', color: 'bg-blue-100 text-blue-800' },
  BUILD: { label: 'Build', color: 'bg-yellow-100 text-yellow-800' },
  PEAK: { label: 'Peak', color: 'bg-green-100 text-green-800' },
  TAPER: { label: 'Taper', color: 'bg-orange-100 text-orange-800' },
  GENERAL_FITNESS: { label: 'General Fitness', color: 'bg-purple-100 text-purple-800' },
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

  function startEdit(week: WeekPlan) {
    setEditingWeek(week.week)
    setEditGuidance(week.clinicalGuidance)
  }

  function saveEdit(weekNumber: number) {
    setWeeklyPlan(prev =>
      prev.map(w => w.week === weekNumber ? { ...w, clinicalGuidance: editGuidance } : w)
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
          const stage = REHAB_STAGE_LABELS[week.rehabStage] ?? { label: week.rehabStage, color: 'bg-gray-100 text-gray-800' }
          const isEditing = editingWeek === week.week

          return (
            <Card key={week.week} className="border">
              <CardContent className="pt-3 pb-3 px-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">Week {week.week} — {week.title}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${stage.color}`}>
                        {stage.label}
                      </span>
                      <span className="text-xs text-muted-foreground">· {week.difficultyLevel}</span>
                    </div>

                    {isEditing ? (
                      <div className="mt-2 space-y-2">
                        <Textarea
                          value={editGuidance}
                          onChange={e => setEditGuidance(e.target.value)}
                          rows={3}
                          className="text-sm"
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

                    {week.contraindicationsThisWeek.length > 0 && (
                      <p className="text-xs text-red-600 mt-1">
                        <span className="font-medium">{week.programMode === 'PERFORMANCE' ? 'Watch:' : 'Avoid:'}</span> {week.contraindicationsThisWeek.join(', ')}
                      </p>
                    )}
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
