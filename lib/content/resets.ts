/**
 * Guided resets. Gentle stretches and positions commonly used for pelvic floor
 * relaxation and trapped gas. Wording is suggestive: these help many people,
 * they are not a treatment, and they never replace a doctor or pelvic floor physio.
 */

export type ResetStep = { title: string; seconds: number; text: string };
export type ResetVariant = { id: string; label: string; steps: ResetStep[] };
export type ResetRoutine = { kind: "heavy" | "gas"; title: string; intro: string; reframe: string; variants: ResetVariant[] };

export const RESETS: Record<"heavy" | "gas", ResetRoutine> = {
  heavy: {
    kind: "heavy",
    title: "Heavy or 'not empty' feeling",
    intro: "Sitting tense for hours can make the area feel full even when it is not. These 2 minutes help the muscles let go.",
    reframe:
      "This feeling is usually a false alarm from sensitive nerves, not stool left inside. Notice it, then move on to something else. Focusing on it makes it louder.",
    variants: [
      {
        id: "desk",
        label: "At a desk",
        steps: [
          {
            title: "Figure-4, right leg",
            seconds: 60,
            text: "Sit near the front of the chair. Cross your right ankle over your left knee. Keep your back flat and lean forward a little until you feel a stretch deep in the right buttock.",
          },
          {
            title: "Figure-4, left leg",
            seconds: 60,
            text: "Switch legs. Part your back teeth, let your tongue rest, and breathe slowly into your lower belly so it expands toward your lap.",
          },
        ],
      },
      {
        id: "home",
        label: "At home",
        steps: [
          {
            title: "Gravity drain",
            seconds: 90,
            text: "Lie on your back. Pull your knees wide toward your armpits, or rest your legs up a wall with knees soft. Breathe slowly into your belly.",
          },
          {
            title: "Squeeze and drop, 3 times",
            seconds: 36,
            text: "Gently tighten the anal muscle at about 20% for 2 seconds, then let it go completely for 10 seconds while breathing out through your mouth. Repeat 3 times.",
          },
        ],
      },
    ],
  },
  gas: {
    kind: "gas",
    title: "Gas or bloating",
    intro: "Positions that let trapped gas move without any pushing. Skip sitting on the toilet to force gas out.",
    reframe: "Gas after a heavy or legume-rich day is normal and passes. A light, cooked meal tomorrow helps.",
    variants: [
      {
        id: "bed",
        label: "On a bed or mat",
        steps: [
          {
            title: "Hips up",
            seconds: 75,
            text: "Kneel, then lower your chest and head onto the bed with your hips up in the air. Let your belly hang loose and breathe slowly.",
          },
          {
            title: "Knees to chest",
            seconds: 60,
            text: "Lie on your back, hug both knees to your chest, and rock gently side to side.",
          },
          {
            title: "Belly circles",
            seconds: 60,
            text: "With your fingertips, massage slowly in a circle: up the right side, across under the ribs, and down the left side.",
          },
          {
            title: "Rest on your left side",
            seconds: 45,
            text: "Roll onto your left side with your right knee drawn up a little. Breathe out slowly.",
          },
        ],
      },
    ],
  },
};

export const PRACTICE_STEPS = [
  "Lie down or sit comfortably, hand on your belly.",
  "Breathe in for 4 seconds. Let the belly rise and imagine the pelvic floor dropping like a lift going down to the ground floor.",
  "Breathe out slowly for 7 seconds with a soft 'Shhh' or 'Mooo'. Keep everything below relaxed.",
  "If you notice a squeeze down there, soften it on the next breath. That noticing is the skill.",
];
