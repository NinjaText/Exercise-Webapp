"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ACTIVITY_LEVELS, COMMON_EQUIPMENT, FITNESS_GOALS } from "@/lib/utils/constants";
import { completeClientOnboarding } from "@/actions/onboarding-actions";
import { toast } from "sonner";
import { Loader2, ArrowRight, ArrowLeft } from "lucide-react";

export function ClientOnboardingForm() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [primaryDiagnosis, setPrimaryDiagnosis] = useState("");
  const [painScore, setPainScore] = useState("");
  const [activityLevel, setActivityLevel] = useState("");
  const [injuryDate, setInjuryDate] = useState("");
  const [surgeryHistory, setSurgeryHistory] = useState("");
  const [occupation, setOccupation] = useState("");
  const [limitations, setLimitations] = useState("");
  const [comorbidities, setComorbidities] = useState("");
  const [functionalChallenges, setFunctionalChallenges] = useState("");
  const [selectedEquipment, setSelectedEquipment] = useState<string[]>([]);
  const [selectedGoals, setSelectedGoals] = useState<string[]>([]);

  function toggleEquipment(item: string) {
    setSelectedEquipment((prev) =>
      prev.includes(item) ? prev.filter((e) => e !== item) : [...prev, item]
    );
  }

  function toggleGoal(goal: string) {
    setSelectedGoals((prev) =>
      prev.includes(goal) ? prev.filter((g) => g !== goal) : [...prev, goal]
    );
  }

  async function handleComplete() {
    if (!firstName || !lastName) {
      toast.error("Please fill in your name");
      return;
    }

    setLoading(true);
    const result = await completeClientOnboarding({
      firstName,
      lastName,
      phone: phone || undefined,
      dateOfBirth: dateOfBirth || undefined,
      limitations: limitations || undefined,
      comorbidities: comorbidities || undefined,
      functionalChallenges: functionalChallenges || undefined,
      availableEquipment: selectedEquipment,
      fitnessGoals: selectedGoals,
      primaryDiagnosis: primaryDiagnosis || undefined,
      painScore: painScore ? parseInt(painScore) : undefined,
      activityLevel: activityLevel || undefined,
      injuryDate: injuryDate || undefined,
      surgeryHistory: surgeryHistory || undefined,
      occupation: occupation || undefined,
    });
    setLoading(false);

    if (result && !result.success) {
      toast.error(result.error);
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-8 flex justify-center gap-2">
        {[1, 2].map((s) => (
          <div
            key={s}
            className={`h-2 w-12 rounded-full transition-colors ${
              s <= step ? "bg-primary" : "bg-muted"
            }`}
          />
        ))}
      </div>

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Your Profile</CardTitle>
            <CardDescription>Tell us a bit about yourself</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name *</Label>
                <Input
                  id="firstName"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name *</Label>
                <Input
                  id="lastName"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Phone (optional)</Label>
              <Input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="dob">Date of Birth</Label>
              <Input
                id="dob"
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
              />
            </div>

            <Button
              className="w-full"
              disabled={!firstName || !lastName}
              onClick={() => setStep(2)}
            >
              Continue <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Clinical Profile</CardTitle>
            <CardDescription>
              This helps your trainer personalize your exercise program
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="primaryDiagnosis">Primary Diagnosis / Reason for Referral</Label>
              <Input
                id="primaryDiagnosis"
                value={primaryDiagnosis}
                onChange={(e) => setPrimaryDiagnosis(e.target.value)}
                placeholder="e.g., ACL Tear Post-Op, Rotator Cuff Tendinopathy"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="painScore">Current Pain Score (0–10)</Label>
                <Input
                  id="painScore"
                  type="number"
                  min="0"
                  max="10"
                  value={painScore}
                  onChange={(e) => setPainScore(e.target.value)}
                  placeholder="0 = no pain"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="activityLevel">Activity Level</Label>
                <select
                  id="activityLevel"
                  value={activityLevel}
                  onChange={(e) => setActivityLevel(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">Select level</option>
                  {ACTIVITY_LEVELS.map((level) => (
                    <option key={level.value} value={level.value}>
                      {level.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="injuryDate">Date of Injury / Surgery</Label>
                <Input
                  id="injuryDate"
                  type="date"
                  value={injuryDate}
                  onChange={(e) => setInjuryDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="occupation">Occupation</Label>
                <Input
                  id="occupation"
                  value={occupation}
                  onChange={(e) => setOccupation(e.target.value)}
                  placeholder="e.g., Nurse, Office worker"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="surgeryHistory">Surgery / Procedure History</Label>
              <Textarea
                id="surgeryHistory"
                value={surgeryHistory}
                onChange={(e) => setSurgeryHistory(e.target.value)}
                placeholder="e.g., Right ACL reconstruction Jan 2024"
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="limitations">Physical Limitations</Label>
              <Textarea
                id="limitations"
                value={limitations}
                onChange={(e) => setLimitations(e.target.value)}
                placeholder="e.g., Cannot fully straighten knee"
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="comorbidities">Medical Conditions</Label>
              <Textarea
                id="comorbidities"
                value={comorbidities}
                onChange={(e) => setComorbidities(e.target.value)}
                placeholder="e.g., Osteoarthritis, Type 2 diabetes"
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="functional">Functional Challenges</Label>
              <Textarea
                id="functional"
                value={functionalChallenges}
                onChange={(e) => setFunctionalChallenges(e.target.value)}
                placeholder="e.g., Difficulty climbing stairs"
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label>Available Equipment</Label>
              <div className="flex flex-wrap gap-2">
                {COMMON_EQUIPMENT.map((eq) => (
                  <Button
                    key={eq}
                    type="button"
                    variant={selectedEquipment.includes(eq) ? "default" : "outline"}
                    size="sm"
                    onClick={() => toggleEquipment(eq)}
                  >
                    {eq}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Rehabilitation Goals</Label>
              <div className="flex flex-wrap gap-2">
                {FITNESS_GOALS.map((goal) => (
                  <Button
                    key={goal}
                    type="button"
                    variant={selectedGoals.includes(goal) ? "default" : "outline"}
                    size="sm"
                    onClick={() => toggleGoal(goal)}
                  >
                    {goal}
                  </Button>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(1)}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button
                className="flex-1"
                disabled={loading}
                onClick={handleComplete}
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Complete Setup
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
