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

  // Your car (driver) and contact after acceptance
  yourCar: { ar_m: 'سيارتك', en: 'Your car' },
  carTitle: { ar_m: 'أخبرنا عن سيارتك', ar_f: 'أخبرينا عن سيارتك', en: 'Tell us about your car' },
  carHint: {
    ar_m: 'يراها الراكب فقط بعد قبول طلبه، ليجد سيارتك بسهولة.',
    en: 'Passengers see this only after you accept them, so they can spot your car.',
  },
  carModel: { ar_m: 'النوع والموديل', en: 'Make and model' },
  carModelPlaceholder: { ar_m: 'كيا بيكانتو', en: 'Kia Picanto' },
  carColor: { ar_m: 'اللون', en: 'Colour' },
  carColorPlaceholder: { ar_m: 'أبيض', en: 'White' },
  plate: { ar_m: 'رقم اللوحة', en: 'Plate number' },
  plateInvalid: { ar_m: 'أدخل رقم اللوحة كما يظهر، مثل 7-1234-95', en: 'Enter the plate as shown, e.g. 7-1234-95' },
  save: { ar_m: 'حفظ', en: 'Save' },
  contactTitle: { ar_m: 'للتواصل', en: 'Contact' },
  call: { ar_m: 'اتصال', en: 'Call' },
  contactHidden: {
    ar_m: 'يظهر رقم الهاتف ومعلومات السيارة بعد القبول.',
    en: 'The phone number and car appear once the request is accepted.',
  },

  // Deadlines and cancelling
  answerBy: { ar_m: 'يردّ السائق قبل', en: 'The driver answers by' },
  answerByDriver: { ar_m: 'الرد قبل', en: 'Answer by' },
  withdrawRequest: { ar_m: 'اسحب الطلب', ar_f: 'اسحبي الطلب', en: 'Withdraw request' },
  cancelSeat: { ar_m: 'ألغِ حجزك', ar_f: 'ألغي حجزك', en: 'Cancel my seat' },
  freeCancelUntil: { ar_m: 'الإلغاء مجاني حتى', en: 'Free to cancel until' },
  lateCancelNote: {
    ar_m: 'بقي أقل من 12 ساعة، الإلغاء الآن متأخر.',
    en: 'Less than 12 hours to go, so cancelling now counts as late.',
  },
  cancelConfirmTitle: { ar_m: 'إلغاء الحجز؟', en: 'Cancel your seat?' },
  cancelConfirmBody: { ar_m: 'سنخبر السائق.', en: "We'll let the driver know." },
  lateCancelTitle: { ar_m: 'إلغاء متأخر', en: 'This is a late cancel' },
  lateCancelBody: {
    ar_m: 'بقي أقل من 12 ساعة على الرحلة. الإلغاء المتأخر يُحسب عليك، وعند بدء الدفع لن يُسترد المبلغ.',
    en: "It's less than 12 hours before the trip. Late cancels count against you, and once payments start they aren't refunded.",
  },
  yesCancel: { ar_m: 'نعم، ألغِ', ar_f: 'نعم، ألغي', en: 'Yes, cancel' },
  keep: { ar_m: 'تراجع', ar_f: 'تراجعي', en: 'Keep it' },
  cancelTrip: { ar_m: 'ألغِ الرحلة', ar_f: 'ألغي الرحلة', en: 'Cancel trip' },
  cancelTripTitle: { ar_m: 'إلغاء الرحلة؟', en: 'Cancel this trip?' },
  cancelTripBody: {
    ar_m: 'سنخبر كل من حجز أو طلب مقعداً. لا يمكن التراجع عن هذا.',
    en: "Everyone with a seat or a request will be told. This can't be undone.",
  },
  tripCancelled: { ar_m: 'أُلغيت هذه الرحلة', en: 'This trip was cancelled' },

  somethingWrong: { ar_m: 'حدث خطأ، حاول مرة أخرى', en: 'Something went wrong, try again' },
} satisfies Record<string, Variants>;

export type StringKey = keyof typeof strings;
