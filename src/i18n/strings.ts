// Every user-facing string lives here, in three variants:
//   ar_m = Arabic addressing a man, ar_f = Arabic addressing a woman, en = English.
// Arabic grammar changes with the gender of the person you talk to
// ("are you ready?" is جاهز؟ to a man and جاهزة؟ to a woman), so we key on it from day one.
// If a string is the same for both genders, ar_f can be left out and ar_m is used.
// Before we know someone's gender (during sign up) we use ar_m, the neutral default in Arabic UI.

export type Variants = { ar_m: string; ar_f?: string; en: string };

export const strings = {
  appName: { ar_m: 'رفيق', en: 'Rafiq' },
  tagline: {
    ar_m: 'مشوارك بين المدن، مضمون',
    en: 'Your ride between cities, guaranteed',
  },
  getStarted: { ar_m: 'ابدأ', ar_f: 'ابدئي', en: 'Get started' },
  continue: { ar_m: 'متابعة', en: 'Continue' },

  // Sign up: phone
  phoneTitle: { ar_m: 'ما رقم جوالك؟', en: "What's your mobile number?" },
  phoneHint: {
    ar_m: 'سنرسل لك رمزاً للتحقق',
    en: "We'll text you a code to confirm it",
  },
  phonePlaceholder: { ar_m: '059 123 4567', en: '059 123 4567' },
  phoneInvalid: {
    ar_m: 'أدخل رقم جوال فلسطيني يبدأ بـ 059 أو 056',
    en: 'Enter a Palestinian mobile starting with 059 or 056',
  },

  // Sign up: code
  codeTitle: { ar_m: 'أدخل الرمز', en: 'Enter the code' },
  codeHint: { ar_m: 'أرسلنا رمزاً من 6 أرقام إلى', en: 'We sent a 6-digit code to' },
  codeInvalid: { ar_m: 'الرمز غير صحيح، حاول مرة أخرى', en: "That code didn't work, try again" },

  // Sign up: profile
  nameTitle: { ar_m: 'ما اسمك؟', en: "What's your name?" },
  nameHint: {
    ar_m: 'كما في هويتك، ليعرفك السائق أو الراكب',
    en: 'As on your ID, so drivers and passengers know you',
  },
  namePlaceholder: { ar_m: 'الاسم الكامل', en: 'Full name' },
  genderLabel: { ar_m: 'كيف نخاطبك؟', en: 'How should we address you?' },
  genderM: { ar_m: 'ذكر', en: 'Male' },
  genderF: { ar_m: 'أنثى', en: 'Female' },

  // Home (placeholder until the next slices)
  welcome: { ar_m: 'أهلاً', en: 'Welcome' },
  signOut: { ar_m: 'تسجيل الخروج', en: 'Sign out' },

  // Post a trip (driver)
  postTrip: { ar_m: 'انشر رحلة', ar_f: 'انشري رحلة', en: 'Post a trip' },
  postTripTitle: { ar_m: 'رحلة جديدة', en: 'New trip' },
  routeLabel: { ar_m: 'الطريق', en: 'Route' },
  dayLabel: { ar_m: 'اليوم', en: 'Day' },
  timeLabel: { ar_m: 'وقت الانطلاق (24 ساعة)', en: 'Departure time (24h)' },
  timeInvalid: { ar_m: 'أدخل وقتاً قادماً مثل 07:30', en: 'Enter an upcoming time like 07:30' },
  seatsLabel: { ar_m: 'المقاعد المتاحة', en: 'Free seats' },
  priceLabel: { ar_m: 'سعر المقعد (₪)', en: 'Price per seat (₪)' },
  priceInvalid: { ar_m: 'أدخل سعراً بين 1 و200 شيكل', en: 'Enter a price between 1 and 200 ILS' },
  publish: { ar_m: 'انشر', ar_f: 'انشري', en: 'Publish' },
  today: { ar_m: 'اليوم', en: 'Today' },
  tomorrow: { ar_m: 'غداً', en: 'Tomorrow' },
  ramallah: { ar_m: 'رام الله', en: 'Ramallah' },
  nablus: { ar_m: 'نابلس', en: 'Nablus' },
  myTrips: { ar_m: 'رحلاتك القادمة', en: 'Your upcoming trips' },
  noTrips: { ar_m: 'لا رحلات بعد', en: 'No trips yet' },
  seatsCount: { ar_m: 'مقاعد', en: 'seats' },

  // Find and request a seat (passenger)
  findSeat: { ar_m: 'ابحث عن مقعد', ar_f: 'ابحثي عن مقعد', en: 'Find a seat' },
  findSeatTitle: { ar_m: 'إلى أين؟', en: 'Where to?' },
  noResults: { ar_m: 'لا رحلات في هذا اليوم بعد', en: 'No trips on this day yet' },
  seatsLeft: { ar_m: 'مقاعد متبقية', en: 'seats left' },
  full: { ar_m: 'ممتلئة', en: 'Full' },
  driverLabel: { ar_m: 'السائق', en: 'Driver' },
  requestSeat: { ar_m: 'اطلب مقعداً', ar_f: 'اطلبي مقعداً', en: 'Request a seat' },
  requestHint: {
    ar_m: 'سيراجع السائق طلبك. ستظهر تفاصيل التواصل بعد القبول.',
    en: 'The driver will review your request. Contact details appear once accepted.',
  },
  myBookings: { ar_m: 'حجوزاتك', en: 'Your bookings' },
  status_requested: { ar_m: 'بانتظار السائق', en: 'Waiting for driver' },
  status_accepted: { ar_m: 'مقبول', en: 'Accepted' },
  status_declined: { ar_m: 'مرفوض', en: 'Declined' },
  status_expired: { ar_m: 'انتهت المهلة', en: 'Expired' },
  status_cancelled: { ar_m: 'ملغى', en: 'Cancelled' },
  status_completed: { ar_m: 'تمت', en: 'Completed' },
  status_no_show: { ar_m: 'لم يحضر', en: 'No-show' },

  // Driver reviews requests
  requestsTitle: { ar_m: 'طلبات المقاعد', en: 'Seat requests' },
  noRequests: { ar_m: 'لا طلبات بعد', en: 'No requests yet' },
  pendingRequests: { ar_m: 'طلبات بانتظارك', en: 'requests waiting for you' },
  accept: { ar_m: 'قبول', en: 'Accept' },
  decline: { ar_m: 'رفض', en: 'Decline' },
  noSeatsLeft: { ar_m: 'لا مقاعد متبقية لهذا الطلب', en: 'Not enough seats left for this request' },

  somethingWrong: { ar_m: 'حدث خطأ، حاول مرة أخرى', en: 'Something went wrong, try again' },
} satisfies Record<string, Variants>;

export type StringKey = keyof typeof strings;
