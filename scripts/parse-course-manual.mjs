/**
 * Parse course manual content and map to academic weeks + timetable events
 * 
 * Academic term starts ~Sept 1, 2026
 * Week 1 = Sept 1-7, Week 2 = Sept 8-14, Week 3 = Sept 15-21, etc.
 * 
 * Course manual weeks (ISO format like wk36, wk37) map to term weeks:
 *   wk36 -> Term Week 1 (Sept 1-7)
 *   wk37 -> Term Week 2 (Sept 8-14)
 *   wk38 -> Term Week 3 (Sept 15-21)
 *   wk39 -> Term Week 4 (Sept 22-28)
 *   wk40 -> Term Week 5 (Sept 29-Oct 5)
 *   wk41 -> Term Week 6 (Oct 6-12)
 *   wk44 -> Term Week 7 (Oct 13-19)
 *   wk45 -> Term Week 8 (Oct 20-26)
 *   wk46 -> Term Week 9 (Oct 27-Nov 2)
 *   wk47 -> Term Week 10 (Nov 3-9)
 *   wk48 -> Term Week 11 (Nov 10-16)
 *   wk49 -> Term Week 12 (Nov 17-23)
 */

// ============================================================================
// PARSED COURSE MANUAL DATA
// ============================================================================

const courseManuals = {
  "57921": { // BT1203 Foundations of International Marketing
    name: "Foundations of international marketing",
    code: "BT1203",
    sessions: [
      {
        label: "Session 1: Introduction",
        topic: "Marketing Strategy - An Overview",
        readings: [
          "Marketing Strategy - An Overview",
          "Marketing Myopia",
          "Strategic Insight in Three Circles"
        ],
        // Session 1 = first marketing lecture (check timetable)
      },
      {
        label: "Session 2: Competitive Analysis & Consumer Behavior",
        topic: "Competitive Analysis & Consumer Behavior",
        readings: [
          "The Coherence Premium",
          "Are You Ignoring Trends That Could Shake Up Your Business?",
          "Strategies to Fight Low-Cost Rivals",
          "Branding in the Digital Age"
        ]
      },
      {
        label: "Session 3: Segmentation & Targeting",
        topic: "Segmentation & Targeting",
        readings: [
          "Note on Consumer Segmentation",
          "Segmenting the Base of the Pyramid",
          "Rediscovering Market Segmentation",
          "Customer Value Propositions in Business Markets"
        ]
      },
      {
        label: "Session 4: Positioning & Pricing Strategy",
        topic: "Positioning & Pricing Strategy",
        readings: [
          "Analyzing Consumer Perceptions",
          "How to Stop Customers from Fixating on Price",
          "Pricing to Create Shared Value"
        ]
      },
      {
        label: "Session 5: Product and Channel Strategy",
        topic: "Product and Channel Strategy",
        readings: [
          "Principles of Product Policy",
          "Strategic Brand Valuation",
          "Strategic Channel Design",
          "The Future of Shopping"
        ]
      },
      {
        label: "Session 6: Promotion & Neuromarketing",
        topic: "Promotion & Neuromarketing",
        readings: [
          "The One Thing You Must Get Right When Building a Brand",
          "For Mobile Devices, Think Apps, Not Ads",
          "Consumer Neuroscience: Applications, Challenges, and Possible Solutions"
        ]
      }
    ]
  },

  "57918": { // BT1201 Introduction to business
    name: "Introduction to business",
    code: "BT1201",
    blocks: [
      {
        name: "BLOCK 1",
        modules: [
          { module: "Module 1 - Introduction and brief history of business (wk36)", chapter: "1 - The Concept of Business in Context", isoWeek: 36, termWeek: 1 },
          { module: "Module 2 - Globalization (wk37)", chapter: "2 - Globalization", isoWeek: 37, termWeek: 2 },
          { module: "Module 2 - Globalization (wk37)", chapter: "3 - The Economy and the State", isoWeek: 37, termWeek: 2 },
          { module: "Module 3 - The environment and business (wk38)", chapter: "3 - The Economy and the State", isoWeek: 38, termWeek: 3 },
          { module: "Module 3 - The environment and business (wk38)", chapter: "4 - Technology and Labour", isoWeek: 38, termWeek: 3 },
          { module: "Module 4 - Cultural & Institutional frameworks - Nature and function (wk39)", chapter: "5 - Cultural and Institutional Frameworks", isoWeek: 39, termWeek: 4 },
          { module: "Module 5 - Cultural & Institutional frameworks - Origins & Change (wk40)", chapter: "3 - The Economy and the State", isoWeek: 40, termWeek: 5 },
          { module: "Module 5 - Cultural & Institutional frameworks - Origins & Change (wk40)", chapter: "5 - Cultural and Institutional Frameworks", isoWeek: 40, termWeek: 5 },
          { module: "Module 6 - Organization and structure (wk41)", chapter: "2 - Globalization", isoWeek: 41, termWeek: 6 },
          { module: "Module 6 - Organization and structure (wk41)", chapter: "6 - Organizational Aspects of Business", isoWeek: 41, termWeek: 6 },
        ]
      },
      {
        name: "BLOCK 2",
        modules: [
          { module: "Module 7 - Founders, owners & managers (wk44)", chapter: "7 - Management & leadership", isoWeek: 44, termWeek: 7 },
          { module: "Module 8 - What is strategy? (wk45)", chapter: "8 - Strategy", isoWeek: 45, termWeek: 8 },
          { module: "Module 9 - Strategic analyses (wk46)", chapter: "8 - Strategy", isoWeek: 46, termWeek: 9 },
          { module: "Module 10 - Strategy formulation (wk47)", chapter: "8 - Strategy", isoWeek: 47, termWeek: 10 },
          { module: "Module 11 - Business Ethics, Sustainability and CSR (wk48)", chapter: "9 - Business Ethics, Sustainability and Corporate Social Responsibility", isoWeek: 48, termWeek: 11 },
          { module: "Module 12 - Wrapping up and looking ahead (wk49)", chapter: "10 - Innovation – Introduction", isoWeek: 49, termWeek: 12 },
          { module: "Module 12 - Wrapping up and looking ahead (wk49)", chapter: "11 – Operations – Introduction", isoWeek: 49, termWeek: 12 },
          { module: "Module 12 - Wrapping up and looking ahead (wk49)", chapter: "12 – Marketing – Introduction", isoWeek: 49, termWeek: 12 },
          { module: "Module 12 - Wrapping up and looking ahead (wk49)", chapter: "13 – Human Resource Management – Introduction", isoWeek: 49, termWeek: 12 },
          { module: "Module 12 - Wrapping up and looking ahead (wk49)", chapter: "14 – Finance and Accounting - Introduction", isoWeek: 49, termWeek: 12 },
        ]
      }
    ]
  },

  "57916": { // BT1202 Organisational behaviour
    name: "Organisational behaviour",
    code: "BT1202",
    sessions: [
      { label: "Week 36 — Lecture 1: What is OB? Introduction", week: 36, lecture: 1, topic: "What is OB? Introduction to the field and focus on core outcomes", readings: ["Chapters 1 & 3"] },
      { label: "Week 37 — Lecture 2: Diversity in organisations", week: 37, lecture: 2, topic: "Diversity in organisations: Individual characteristics, ability, personality, and values", readings: ["Chapters 2 & 5"] },
      { label: "Week 38 — Lecture 3: Motivation", week: 38, lecture: 3, topic: "Motivation", readings: ["Chapters 7 & 8"] },
      { label: "Week 39 — Lecture 4: Perception & decision making", week: 39, lecture: 4, topic: "Perception & decision making", readings: ["Chapter 6"] },
      { label: "Week 40 — Workshop: Team simulation", week: 40, lecture: 5, topic: "Team simulation", readings: [] },
      { label: "Week 40 — Lecture 5: Groups & teams", week: 40, lecture: 5, topic: "Groups & teams", readings: ["Chapters 9 & 10"] },
      { label: "Week 41 — Lecture 6: Leadership & power", week: 41, lecture: 6, topic: "Leadership & power", readings: ["Chapters 12 & 13 (only 13.1-13.4)"] },
    ]
  }
};

// ============================================================================
// ISO WEEK -> TERM WEEK MAPPING
// ============================================================================

function isoWeekToTermWeek(isoWeek) {
  const mapping = {
    36: 1, 37: 2, 38: 3, 39: 4, 40: 5, 41: 6,
    44: 7, 45: 8, 46: 9, 47: 10, 48: 11, 49: 12
  };
  return mapping[isoWeek] || null;
}

function isoWeekToDateRange(isoWeek, year = 2026) {
  // Approximate ISO week start dates for 2026
  const isoWeekStarts = {
    36: "2026-09-07",
    37: "2026-09-14",
    38: "2026-09-21",
    39: "2026-09-28",
    40: "2026-10-05",
    41: "2026-10-12",
    44: "2026-10-26",
    45: "2026-11-02",
    46: "2026-11-09",
    47: "2026-11-16",
    48: "2026-11-23",
    49: "2026-11-30",
  };
  const start = isoWeekStarts[isoWeek];
  if (!start) return null;
  const end = new Date(new Date(start).getTime() + 6 * 24 * 60 * 60 * 1000);
  return { start, end: end.toISOString().split('T')[0] };
}

function termWeekToDateRange(termWeek, year = 2026) {
  // Academic term starts Sept 1, 2026 (Tuesday)
  const termStart = new Date("2026-09-01");
  const start = new Date(termStart.getTime() + (termWeek - 1) * 7 * 24 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000);
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0]
  };
}

// ============================================================================
// GENERATE STRUCTURED READINGS FOR DATABASE
// ============================================================================

function generateReadings() {
  const allReadings = [];

  // BT1203 - Foundations of International Marketing (no explicit weeks, map to marketing sessions)
  const marketing = courseManuals["57921"];
  marketing.sessions.forEach((session, idx) => {
    const termWeek = idx + 1; // Sessions 1-6 map to term weeks 1-6 (roughly)
    session.readings.forEach(reading => {
      allReadings.push({
        courseCanvasId: "57921",
        courseName: marketing.name,
        lectureLabel: session.label,
        readingText: reading,
        detail: session.topic,
        termWeek,
        isoWeek: null,
        lectureSlot: "lecture_1"
      });
    });
  });

  // BT1201 - Introduction to Business (has explicit ISO weeks)
  const introBiz = courseManuals["57918"];
  introBiz.blocks.forEach(block => {
    block.modules.forEach(mod => {
      allReadings.push({
        courseCanvasId: "57918",
        courseName: introBiz.name,
        lectureLabel: mod.module,
        readingText: mod.chapter,
        detail: block.name,
        termWeek: mod.termWeek,
        isoWeek: mod.isoWeek,
        lectureSlot: "lecture_1"
      });
    });
  });

  // BT1202 - Organisational Behaviour (has explicit ISO weeks)
  const ob = courseManuals["57916"];
  ob.sessions.forEach(session => {
    const termWeek = isoWeekToTermWeek(session.week);
    session.readings.forEach(reading => {
      allReadings.push({
        courseCanvasId: "57916",
        courseName: ob.name,
        lectureLabel: session.label,
        readingText: reading,
        detail: session.topic,
        termWeek,
        isoWeek: session.week,
        lectureSlot: session.lecture === 1 ? "lecture_1" : 
                   session.lecture === 2 ? "lecture_2" : 
                   session.lecture === 3 ? "lecture_3" : "unknown"
      });
    });
    // Add workshop entry even without readings
    if (session.readings.length === 0) {
      allReadings.push({
        courseCanvasId: "57916",
        courseName: ob.name,
        lectureLabel: session.label,
        readingText: session.label,
        detail: session.topic,
        termWeek,
        isoWeek: session.week,
        lectureSlot: session.lecture === 1 ? "lecture_1" : 
                   session.lecture === 2 ? "lecture_2" : 
                   session.lecture === 3 ? "lecture_3" : "unknown"
      });
    }
  });

  return allReadings;
}

const readings = generateReadings();
console.log("Total readings to insert:", readings.length);
console.log("\nBy course:");
const byCourse = {};
readings.forEach(r => {
  if (!byCourse[r.courseCanvasId]) byCourse[r.courseCanvasId] = [];
  byCourse[r.courseCanvasId].push(r);
});
Object.entries(byCourse).forEach(([courseId, items]) => {
  console.log(`  ${courseId}: ${items.length} readings`);
  // Show first few
  items.slice(0, 5).forEach(r => {
    console.log(`    Term Week ${r.termWeek} | ${r.lectureLabel} | ${r.readingText}`);
  });
  if (items.length > 5) console.log(`    ... and ${items.length - 5} more`);
});

// Export for use in other scripts
export { readings, courseManuals, isoWeekToTermWeek, isoWeekToDateRange, termWeekToDateRange, generateReadings };