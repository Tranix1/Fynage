const tintColorLight = '#0a7ea4';
const tintColorDark = '#fff';

const accent = '#70C8F5';
const accentlight = '#70C8F51A';

const coolGray = '#C4C4C4';


// Transix Brand Colors
export const BRAND = {
  navy: '#12315C',
  teal: '#0E8C82',
  amber: '#E08A2C',
  good: '#1E8E5A',
  bad: '#C24343',
  info: '#4285F4',
};


export const Colors = {

  light: {

    text: '#141414',
    textPlaceholder: '#14141420',
    textlight: '#4B5563',

    background: '#F9F9F9',
    backgroundLight: '#F0EFEF',
    surface: '#FFFFFF',
    input: '#FFFFFF',
    subtle: '#E6F0E9',
    selection: '#DFF3FF',
    incomeSelection: '#EAF5EE',
    moneyIn: '#18804B',
    warningBackground: '#FFF1D8',
    warningText: '#624816',

    tint: tintColorLight,

    icon: '#3E4B59',

    tabIconDefault: '#3E4B59',
    tabIconSelected: tintColorLight,

    accent,
    accentlight,

    coolGray,

    border: '#D0D5DD',


    // Transix
    ...BRAND,


    // Finance
    income: BRAND.good,
    expense: BRAND.bad,
    profit: BRAND.teal,
    warning: BRAND.amber,


    // Status
    available: BRAND.good,
    active: BRAND.teal,
    pending: BRAND.amber,
    rejected: BRAND.bad,

  },


  dark: {

    text: '#ECEDEE',
    textPlaceholder: '#ECEDEE20',
    textlight: '#9b9c9f',

    background: '#0f0e11',
    backgroundLight: '#222425',
    surface: '#191a1d',
    input: '#191a1d',
    subtle: '#252b28',
    selection: '#15364A',
    incomeSelection: '#193629',
    moneyIn: '#62D99B',
    warningBackground: '#3B301B',
    warningText: '#F2D58A',

    tint: tintColorDark,

    icon: '#9BA1A6',

    tabIconDefault: '#9BA1A6',
    tabIconSelected: tintColorDark,

    accent,
    accentlight,

    coolGray,

    border: '#2B2F33',


    // Transix
    ...BRAND,


    // Finance
    income: BRAND.good,
    expense: BRAND.bad,
    profit: BRAND.teal,
    warning: BRAND.amber,


    // Status
    available: BRAND.good,
    active: BRAND.teal,
    pending: BRAND.amber,
    rejected: BRAND.bad,

  },

};
