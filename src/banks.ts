export type BankDefinition = {
  id: string;
  name: string;
  shortName: string;
  logo: string;
  region: 'fr' | 'us';
};

export const FRENCH_BANKS: BankDefinition[] = [
  { id: 'fr-bnp', name: 'BNP Paribas', shortName: 'BNP', logo: '/assets/banks_logo/bnp.png', region: 'fr' },
  { id: 'fr-ca', name: 'Crédit Agricole', shortName: 'CA', logo: '/assets/banks_logo/ca.png', region: 'fr' },
  { id: 'fr-cic', name: 'Crédit Industriel et Commercial', shortName: 'CIC', logo: '/assets/banks_logo/cic.png', region: 'fr' },
  { id: 'fr-cm', name: 'Crédit Mutuel', shortName: 'CM', logo: '/assets/banks_logo/cm.png', region: 'fr' },
  { id: 'fr-lbp', name: 'La Banque Postale', shortName: 'LBP', logo: '/assets/banks_logo/lbp.png', region: 'fr' },
  { id: 'fr-sg', name: 'Société Générale', shortName: 'SG', logo: '/assets/banks_logo/sg.png', region: 'fr' },
  { id: 'fr-lcl', name: 'LCL', shortName: 'LCL', logo: '/assets/banks_logo/lcl.png', region: 'fr' },
  { id: 'fr-bp', name: 'Banque Populaire', shortName: 'BP', logo: '/assets/banks_logo/bp.png', region: 'fr' },
  { id: 'fr-hsbc', name: 'HSBC France', shortName: 'HSBC', logo: '/assets/banks_logo/hsbc.png', region: 'fr' },
  { id: 'fr-brs', name: 'Boursorama', shortName: 'BRS', logo: '/assets/banks_logo/brs.png', region: 'fr' },
  { id: 'fr-frt', name: 'Fortuneo', shortName: 'FRT', logo: '/assets/banks_logo/frt.png', region: 'fr' },
  { id: 'fr-hb', name: 'Hello bank!', shortName: 'HB', logo: '/assets/banks_logo/hb.png', region: 'fr' },
  { id: 'fr-mnb', name: 'Monabanq', shortName: 'MNB', logo: '/assets/banks_logo/mnb.png', region: 'fr' },
  { id: 'fr-ing', name: 'ING', shortName: 'ING', logo: '/assets/banks_logo/ing.png', region: 'fr' },
  { id: 'fr-bfb', name: 'BforBank', shortName: 'BFB', logo: '/assets/banks_logo/bfb.png', region: 'fr' },
  { id: 'fr-ob', name: 'Orange Bank', shortName: 'OB', logo: '/assets/banks_logo/ob.png', region: 'fr' },
  { id: 'fr-mfb', name: 'Ma French Bank', shortName: 'MFB', logo: '/assets/banks_logo/mfb.png', region: 'fr' },
  { id: 'fr-n26', name: 'N26', shortName: 'N26', logo: '/assets/banks_logo/n26.png', region: 'fr' },
  { id: 'fr-rev', name: 'Revolut', shortName: 'REV', logo: '/assets/banks_logo/rev.png', region: 'fr' },
  { id: 'fr-nck', name: 'Nickel', shortName: 'NCK', logo: '/assets/banks_logo/nck.png', region: 'fr' },
  { id: 'fr-qto', name: 'Qonto', shortName: 'QTO', logo: '/assets/banks_logo/qto.png', region: 'fr' },
  { id: 'fr-shn', name: 'Shine', shortName: 'SHN', logo: '/assets/banks_logo/shn.png', region: 'fr' },
  { id: 'fr-czm', name: 'C-Zam', shortName: 'CZM', logo: '/assets/banks_logo/czm.png', region: 'fr' },
  { id: 'fr-axa', name: 'AXA Banque', shortName: 'AXA', logo: '/assets/banks_logo/axa.png', region: 'fr' },
  { id: 'fr-ony', name: 'Oney Bank', shortName: 'ONY', logo: '/assets/banks_logo/ony.png', region: 'fr' }
];

export const US_BANKS: BankDefinition[] = [];

const BANKS = [...FRENCH_BANKS, ...US_BANKS];

export const resolveBankDefinition = (id: string) => (
  BANKS.find(bank => bank.id === id) ?? null
);

const normalizeBankLabel = (value: string) => (
  value.toLowerCase().replace(/[^a-z0-9]/g, '')
);

export const resolveBankDefinitionByLabel = (label: string) => {
  const normalized = normalizeBankLabel(label);
  if (!normalized) {
    return null;
  }
  return (
    BANKS.find(bank => normalizeBankLabel(bank.name) === normalized)
    ?? BANKS.find(bank => normalizeBankLabel(bank.shortName) === normalized)
    ?? null
  );
};
