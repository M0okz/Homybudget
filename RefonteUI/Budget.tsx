import { useState } from "react";
import { Header } from "@/components/layout/Header";
import { PersonColumn } from "@/components/budget/PersonColumn";
import { JointAccount } from "@/components/budget/JointAccount";

// Mock data
const gregoryData = {
  name: "Grégory",
  revenues: [
    { id: "1", label: "Salaire", amount: 1600 },
  ],
  fixedExpenses: [
    { id: "1", label: "Loyer", amount: 830, category: "housing" as const, categoryLabel: "Logement" },
    { id: "2", label: "Électricité+gaz", amount: 90, category: "utilities" as const, categoryLabel: "Factures" },
    { id: "3", label: "Free Fibre", amount: 53, category: "utilities" as const, categoryLabel: "Factures" },
    { id: "4", label: "Basic-Fit", amount: 36, category: "sport" as const, categoryLabel: "Sport" },
    { id: "5", label: "Assurance Habitation", amount: 30, category: "housing" as const, categoryLabel: "Logement" },
    { id: "6", label: "Chatgpt", amount: 23, category: "subscriptions" as const, categoryLabel: "Abonnements" },
    { id: "7", label: "Sfr Mobile", amount: 16, category: "utilities" as const, categoryLabel: "Factures" },
    { id: "8", label: "plex", amount: 10, category: "subscriptions" as const, categoryLabel: "Abonnements" },
  ],
  variableExpenses: [
    { id: "9", label: "Voiture", amount: 334, category: "transport" as const, categoryLabel: "Transport" },
    { id: "10", label: "Cetelem + Sof", amount: 218, category: "other" as const, categoryLabel: "Autres" },
  ],
};

const palomaData = {
  name: "Paloma",
  revenues: [
    { id: "1", label: "Salaire", amount: 762 },
    { id: "2", label: "Caf", amount: 44 },
  ],
  fixedExpenses: [
    { id: "1", label: "Courses", amount: 200, category: "food" as const, categoryLabel: "Courses", checked: true },
    { id: "2", label: "Credit Voiture", amount: 157, category: "transport" as const, categoryLabel: "Transport" },
    { id: "3", label: "Essence", amount: 70, category: "transport" as const, categoryLabel: "Transport" },
    { id: "4", label: "Ongles", amount: 50, category: "other" as const, categoryLabel: "Quotidien" },
    { id: "5", label: "Assurance Voiture", amount: 41, category: "transport" as const, categoryLabel: "Transport" },
    { id: "6", label: "Basic Fit", amount: 25, category: "sport" as const, categoryLabel: "Sport" },
    { id: "7", label: "SFR Mobile", amount: 20, category: "utilities" as const, categoryLabel: "Factures" },
    { id: "8", label: "Spotify", amount: 12, category: "subscriptions" as const, categoryLabel: "Abonnements" },
    { id: "9", label: "Netflix", amount: 6, category: "subscriptions" as const, categoryLabel: "Abonnements" },
    { id: "10", label: "Prévoyance", amount: 6, category: "health" as const, categoryLabel: "Santé" },
    { id: "11", label: "Apple Icloud", amount: 1, category: "subscriptions" as const, categoryLabel: "Abonnements" },
    { id: "12", label: "Épargne", amount: 0, category: "savings" as const, categoryLabel: "Épargne" },
  ],
  variableExpenses: [
    { id: "13", label: "Amazon", amount: 73, category: "other" as const, categoryLabel: "Autres" },
  ],
};

const jointAccountData = {
  initialBalance: 0,
  currentBalance: 100,
  transactions: [
    { 
      id: "1", 
      date: "2026-01-16", 
      type: "deposit" as const, 
      description: "Nouveau versement", 
      amount: 100, 
      person: "gregory" 
    },
  ],
};

const months = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
];

export default function Budget() {
  const [currentMonth, setCurrentMonth] = useState(0); // January
  const [currentYear, setCurrentYear] = useState(2026);

  const handlePreviousMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <Header 
        month={months[currentMonth]} 
        year={currentYear}
        onPreviousMonth={handlePreviousMonth}
        onNextMonth={handleNextMonth}
      />
      
      <main className="flex-1 p-6">
        <div className="mx-auto max-w-7xl space-y-8">
          {/* Two person columns */}
          <div className="grid gap-8 lg:grid-cols-2">
            <PersonColumn {...gregoryData} />
            <PersonColumn {...palomaData} />
          </div>
          
          {/* Joint account */}
          <JointAccount {...jointAccountData} />
        </div>
      </main>
    </div>
  );
}
