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
  continue: { ar_m: 'تابع', ar_f: 'تابعي', en: 'Continue' },
  back: { ar_m: 'رجوع', en: 'Back' },

  // Tab dock
  tabHome: { ar_m: 'الرئيسية', en: 'Home' },
  tabTrips: { ar_m: 'رحلاتي', en: 'My trips' },
  tabCheckpoints: { ar_m: 'الحواجز', en: 'Checkpoints' },
  tabProfile: { ar_m: 'حسابي', en: 'Account' },

  // Checkpoint statuses
  statusOpen: { ar_m: 'مفتوح', en: 'Open' },
  statusCrowded: { ar_m: 'مزدحم', en: 'Crowded' },
  statusClosed: { ar_m: 'مغلق', en: 'Closed' },

  // Welcome
  otherLanguage: { ar_m: 'English', en: 'العربية' },
  slide1Title: { ar_m: 'الرفيق قبل الطريق.', en: 'The company before the road.' },
  slide1Body: {
    ar_m: 'مقعد محجوز مسبقًا بين المدن، مع سائق موثّق وسعر واضح.',
    en: 'A seat booked ahead between cities, with a verified driver and a clear price.',
  },
  slide2Title: { ar_m: 'تعرف من يقود قبل أن تركب.', en: 'Know who drives before you ride.' },
  slide2Body: {
    ar_m: 'نراجع كل سائق بأنفسنا: الهوية والرخصة والسيارة واللوحة.',
    en: 'We check every driver ourselves: ID, licence, car and plate.',
  },
  slide3Title: { ar_m: 'الحواجز قبل أن تصلها.', en: 'Checkpoints before you reach them.' },
  slide3Body: {
    ar_m: 'حالة كل حاجز على طريقك، من الركّاب والسائقين، لحظة بلحظة.',
    en: 'The status of every checkpoint on your way, from riders and drivers, as it happens.',
  },
  slideLabel: { ar_m: 'الشريحة', en: 'Slide' },
  startWithPhone: { ar_m: 'ابدأ برقم هاتفك', en: 'Start with your phone number' },
  termsNote: {
    ar_m: 'بالمتابعة توافق على الشروط وسياسة الخصوصية.',
    en: 'By continuing you agree to the Terms and Privacy Policy.',
  },
  demoFrom: { ar_m: 'رام الله · دوار المنارة', en: 'Ramallah · Al-Manara Sq.' },
  demoTo: { ar_m: 'نابلس · دوار الشهداء', en: 'Nablus · Martyrs Sq.' },
  demoSeat: { ar_m: 'مقعدك محجوز', en: 'Your seat is booked' },
  demoCar: { ar_m: 'إلنترا فضّية', en: 'Silver Elantra' },
  demoDriver: { ar_m: 'محمد عواد', en: 'Mohammad Awad' },
  demoStats: { ar_m: '142 رحلة · 4.9 تقييم · سائق مؤسس', en: '142 trips · 4.9 rating · Founding driver' },
  idVerified: { ar_m: 'هوية موثّقة', en: 'ID verified' },
  licenseVerified: { ar_m: 'رخصة موثّقة', en: 'Licence verified' },
  carVerified: { ar_m: 'سيارة موثّقة', en: 'Car verified' },
  cpAttara: { ar_m: 'عطارة', en: 'Attara' },
  cpZaatara: { ar_m: 'زعترة', en: 'Zaatara' },
  cpHuwara: { ar_m: 'حوارة', en: 'Huwara' },

  // Sign up: phone
  phoneTitle: { ar_m: 'أدخل رقم هاتفك', en: 'Enter your phone number' },
  phoneHint: {
    ar_m: 'سنرسل لك رمزًا من 6 أرقام. لا نشارك رقمك مع أحد قبل قبول الرحلة.',
    en: "We'll text you a 6-digit code. Nobody sees your number until a trip is accepted.",
  },
  phoneLabel: { ar_m: 'رقم الهاتف', en: 'Phone number' },
  phonePlaceholder: { ar_m: '59 123 4567', en: '59 123 4567' },
  countryPS: { ar_m: '+970 فلسطين', en: '+970 Palestine' },
  sendCode: { ar_m: 'أرسل الرمز', en: 'Send code' },
  phoneInvalid: {
    ar_m: 'أدخل رقم جوال يبدأ بـ 59 أو 56',
    en: 'Enter a mobile number starting with 59 or 56',
  },

  // Sign up: code
  codeTitle: { ar_m: 'أدخل الرمز', en: 'Enter the code' },
  codeHint: { ar_m: 'أرسلناه إلى', en: 'We sent it to' },
  codeInvalid: { ar_m: 'الرمز غير صحيح، حاول مرة أخرى', en: "That code didn't work, try again" },
  resendIn: { ar_m: 'إعادة الإرسال بعد', en: 'Resend in' },
  resend: { ar_m: 'أعد إرسال الرمز', en: 'Resend the code' },
  changeNumber: { ar_m: 'غيّر الرقم', en: 'Change the number' },
  checking: { ar_m: 'نتحقق من الرمز…', en: 'Checking the code…' },

  // Sign up: profile
  nameTitle: { ar_m: 'كيف نناديك؟', en: 'What should we call you?' },
  nameHint: {
    ar_m: 'اكتب اسمك كما في الهوية. يرى السائق اسمك الأول وأول حرف من عائلتك.',
    en: 'Write your name as on your ID. Drivers see your first name and last initial.',
  },
  firstName: { ar_m: 'الاسم الأول', en: 'First name' },
  lastName: { ar_m: 'اسم العائلة', en: 'Last name' },
  namePreviewHint: { ar_m: 'هكذا يظهر اسمك للآخرين', en: 'This is how others see your name' },
  genderLabel: { ar_m: 'كيف نخاطبك؟', en: 'How should we address you?' },
  genderM: { ar_m: 'ذكر', en: 'Male' },
  genderF: { ar_m: 'أنثى', en: 'Female' },

  // Home
  greetingMorning: { ar_m: 'صباح الخير', en: 'Good morning' },
  greetingEvening: { ar_m: 'مساء الخير', en: 'Good evening' },
  quickSearch: { ar_m: 'ابحث', ar_f: 'ابحثي', en: 'Search' },
  yourNextTrip: { ar_m: 'رحلتك القادمة', en: 'Your next trip' },
  waitingForDriver: { ar_m: 'في انتظار قبول السائق', en: 'Waiting for the driver to accept' },
  seatConfirmed: { ar_m: 'مقعدك مؤكد', en: 'Your seat is confirmed' },
  requestsWaiting: { ar_m: 'طلبات مقاعد بانتظارك', en: 'Seat requests waiting for you' },
  partMorning: { ar_m: 'صباحًا', en: 'Morning' },
  partAfternoon: { ar_m: 'ظهرًا', en: 'Afternoon' },
  partEvening: { ar_m: 'مساءً', en: 'Evening' },
  am: { ar_m: 'صباحًا', en: 'AM' },
  pm: { ar_m: 'مساءً', en: 'PM' },

  // Where to
  fromLabel: { ar_m: 'من', en: 'From' },
  toLabel: { ar_m: 'إلى', en: 'To' },
  swapDirection: { ar_m: 'اعكس الاتجاه', en: 'Swap direction' },
  whenLabel: { ar_m: 'متى؟', en: 'When?' },
  searchTrips: { ar_m: 'ابحث عن رحلة', ar_f: 'ابحثي عن رحلة', en: 'Search trips' },

  // Results
  tripsCount: { ar_m: 'رحلات', en: 'trips' },
  earliestFirst: { ar_m: 'الأبكر أولًا', en: 'earliest first' },
  seatsFree: { ar_m: 'مقاعد متاحة', en: 'seats free' },

  // My trips and account
  asPassenger: { ar_m: 'حجوزاتك', en: 'Your bookings' },
  asDriver: { ar_m: 'رحلاتك كسائق', en: 'Your trips as a driver' },
  noBookings: { ar_m: 'لم تحجز أي مقعد بعد', ar_f: 'لم تحجزي أي مقعد بعد', en: "You haven't booked a seat yet" },
  accountTitle: { ar_m: 'حسابي', en: 'Account' },
  languageRow: { ar_m: 'اللغة', en: 'Language' },
  languageName: { ar_m: 'العربية', en: 'English' },
  addYourCar: { ar_m: 'أضف سيارتك', ar_f: 'أضيفي سيارتك', en: 'Add your car' },
  forDrivers: { ar_m: 'للسائقين', en: 'For drivers' },

  // Trip details, waiting, ticket
  sentRequestTo: { ar_m: 'أرسلت طلبك إلى', ar_f: 'أرسلتِ طلبك إلى', en: 'You sent your request to' },
  seatIsConfirmed: { ar_m: 'تم تأكيد مقعدك', en: 'Your seat is confirmed' },
  waitExplain: {
    ar_m: 'إذا لم يرد السائق خلال هذا الوقت، يُلغى الطلب تلقائيًا ويمكنك طلب رحلة أخرى.',
    ar_f: 'إذا لم يرد السائق خلال هذا الوقت، يُلغى الطلب تلقائيًا ويمكنكِ طلب رحلة أخرى.',
    en: "If the driver doesn't answer in time, the request ends on its own and you can ask for another trip.",
  },
  carLabel: { ar_m: 'السيارة', en: 'Car' },
  perSeat: { ar_m: 'للمقعد', en: 'per seat' },
  plateLabel: { ar_m: 'اللوحة', en: 'Plate' },
  shareTrip: { ar_m: 'شارك رحلتك مع العائلة', ar_f: 'شاركي رحلتك مع العائلة', en: 'Share your trip with family' },
  shareMessage: {
    ar_m: 'رحلتي مع رفيق: {route}، {when}. السائق {driver}، {car}، لوحة {plate}.',
    en: 'My Rafiq trip: {route}, {when}. Driver {driver}, {car}, plate {plate}.',
  },
  detailsAfterAccept: {
    ar_m: 'رقم السائق ولوحة السيارة يظهران بعد قبول طلبك.',
    en: "The driver's number and plate appear once your request is accepted.",
  },

  // Driver screens
  colorWhite: { ar_m: 'أبيض', en: 'White' },
  colorSilver: { ar_m: 'فضي', en: 'Silver' },
  colorGray: { ar_m: 'رمادي', en: 'Grey' },
  colorBlack: { ar_m: 'أسود', en: 'Black' },
  colorBlue: { ar_m: 'أزرق', en: 'Blue' },
  colorRed: { ar_m: 'أحمر', en: 'Red' },
  otherColor: { ar_m: 'لون آخر', en: 'Another colour' },
  platePreviewHint: {
    ar_m: 'هكذا تظهر لوحتك للراكب بعد القبول',
    en: 'This is how passengers see your plate once accepted',
  },
  saveCar: { ar_m: 'احفظ السيارة', ar_f: 'احفظي السيارة', en: 'Save car' },
  publishTrip: { ar_m: 'انشر الرحلة', ar_f: 'انشري الرحلة', en: 'Publish trip' },
  departureTime: { ar_m: 'وقت الانطلاق', en: 'Departure time' },
  seatPrice: { ar_m: 'سعر المقعد', en: 'Price per seat' },
  suggestedPrice: { ar_m: 'المقترح لهذا الطريق', en: 'Suggested for this route' },
  yourNextDrive: { ar_m: 'رحلتك القادمة كسائق', en: 'Your next trip as a driver' },
  seatsBookedOf: { ar_m: 'من', en: 'of' },
  seatsBooked: { ar_m: 'مقاعد محجوزة', en: 'seats booked' },
  newRequestFrom: { ar_m: 'طلب جديد من', en: 'New request from' },
  answerWithin: { ar_m: 'ردّ خلال', ar_f: 'ردّي خلال', en: 'answer within' },
  passengers: { ar_m: 'الركّاب', en: 'Passengers' },
  seatOne: { ar_m: 'مقعد', en: 'seat' },
  declineSorry: { ar_m: 'اعتذر', ar_f: 'اعتذري', en: 'Decline' },
  acceptRequest: { ar_m: 'اقبل الطلب', ar_f: 'اقبلي الطلب', en: 'Accept request' },
  unanswered: {
    ar_m: 'إذا لم ترد خلال الوقت، يُلغى الطلب تلقائيًا.',
    ar_f: 'إذا لم تردي خلال الوقت، يُلغى الطلب تلقائيًا.',
    en: "If you don't answer in time, the request ends on its own.",
  },

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
  carTitle: { ar_m: 'سيارتك', en: 'Your car' },
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
  cancelConfirmBody: { ar_m: 'سنخبر السائق ونعيد لك المبلغ كاملاً.', en: "We'll let the driver know and refund you in full." },
  lateCancelTitle: { ar_m: 'إلغاء متأخر', en: 'This is a late cancel' },
  lateCancelBody: {
    ar_m: 'بقي أقل من 12 ساعة على الرحلة، لذلك لن يُسترد المبلغ.',
    en: "It's less than 12 hours before the trip, so the seat isn't refunded.",
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

  // ID checks (slice 5)
  verifyPassengerTitle: { ar_m: 'وثّق هويتك', ar_f: 'وثّقي هويتك', en: 'Verify your ID' },
  verifyPassengerBody: {
    ar_m: 'قبل حجزك الأول، أضف صورة واضحة لبطاقة هويتك. هكذا يعرف السائق من يركب معه.',
    ar_f: 'قبل حجزك الأول، أضيفي صورة واضحة لبطاقة هويتك. هكذا يعرف السائق من يركب معه.',
    en: 'Before your first booking, add a clear photo of your ID card. That way drivers know who rides with them.',
  },
  verifyDriverTitle: { ar_m: 'فحص السائق', en: 'Driver check' },
  verifyDriverBody: {
    ar_m: 'قبل رحلتك الأولى، أضف صور هويتك ورخصة القيادة وسيارتك واللوحة ظاهرة. نراجع كل سائق بأنفسنا.',
    ar_f: 'قبل رحلتك الأولى، أضيفي صور هويتك ورخصة القيادة وسيارتك واللوحة ظاهرة. نراجع كل سائق بأنفسنا.',
    en: 'Before your first trip, add photos of your ID, driving licence and your car with the plate showing. We check every driver ourselves.',
  },
  slot_id: { ar_m: 'بطاقة الهوية', en: 'ID card' },
  slot_licence: { ar_m: 'رخصة القيادة', en: 'Driving licence' },
  slot_car: { ar_m: 'السيارة واللوحة ظاهرة', en: 'Car, with the plate showing' },
  addPhoto: { ar_m: 'أضف صورة', ar_f: 'أضيفي صورة', en: 'Add photo' },
  changePhoto: { ar_m: 'تغيير', en: 'Change' },
  takePhoto: { ar_m: 'التقط صورة', ar_f: 'التقطي صورة', en: 'Take a photo' },
  choosePhoto: { ar_m: 'اختر من الصور', ar_f: 'اختاري من الصور', en: 'Choose from photos' },
  cancel: { ar_m: 'إلغاء', en: 'Cancel' },
  photoPermission: {
    ar_m: 'اسمح لرفيق بالوصول إلى الصور أو الكاميرا من الإعدادات.',
    ar_f: 'اسمحي لرفيق بالوصول إلى الصور أو الكاميرا من الإعدادات.',
    en: 'Allow Rafiq to use your photos or camera in Settings.',
  },
  sendForReview: { ar_m: 'أرسل للمراجعة', ar_f: 'أرسلي للمراجعة', en: 'Send for review' },
  photosPrivate: {
    ar_m: 'صورك خاصة، لا يراها إلا فريق المراجعة في رفيق.',
    en: 'Your photos are private. Only the Rafiq review team sees them.',
  },
  needCarFirst: {
    ar_m: 'أضف سيارتك أولاً، ثم أرسل الصور.',
    ar_f: 'أضيفي سيارتك أولاً، ثم أرسلي الصور.',
    en: 'Add your car first, then send the photos.',
  },
  checkPendingTitle: { ar_m: 'نراجع طلبك', en: "We're checking" },
  checkPendingBody: { ar_m: 'نرد عادةً خلال يوم واحد، وسنخبرك.', en: "We usually answer within a day. We'll let you know." },
  checkApprovedTitle: { ar_m: 'تم التوثيق', en: "You're verified" },
  checkApprovedPassenger: { ar_m: 'يمكنك حجز المقاعد الآن.', en: 'You can book seats now.' },
  checkApprovedDriver: { ar_m: 'يمكنك نشر الرحلات الآن.', en: 'You can post trips now.' },
  checkRejectedTitle: { ar_m: 'نحتاج صورًا جديدة', en: 'We need new photos' },
  done: { ar_m: 'تم', en: 'Done' },
  idCheckRow: { ar_m: 'توثيق الهوية', en: 'ID check' },
  driverCheckRow: { ar_m: 'فحص السائق', en: 'Driver check' },
  checkState_none: { ar_m: 'لم يتم بعد', en: 'Not yet' },
  checkState_pending: { ar_m: 'قيد المراجعة', en: 'Under review' },
  checkState_rejected: { ar_m: 'نحتاج صورًا جديدة', en: 'Needs new photos' },
  checkState_approved: { ar_m: 'موثّق', en: 'Verified' },
  verifiedDriver: { ar_m: 'سائق موثّق', en: 'Verified driver' },
  driverCheckNeeded: {
    ar_m: 'لم تتم الموافقة على فحص السائق بعد.',
    en: 'Your driver check is not approved yet.',
  },


  // Payments (slice 6)
  checkoutTitle: { ar_m: 'ادفع واطلب مقعدك', ar_f: 'ادفعي واطلبي مقعدك', en: 'Pay and request' },
  checkoutHint: {
    ar_m: 'نحجز المبلغ على بطاقتك الآن، ولا يُخصم إلا إذا قبل السائق طلبك.',
    en: "We hold the amount on your card now. You're only charged if the driver accepts.",
  },
  fareLine: { ar_m: 'المقعد', en: 'Seat' },
  feeLine: { ar_m: 'رسوم الخدمة', en: 'Service fee' },
  totalLine: { ar_m: 'المجموع', en: 'Total' },
  cardNumber: { ar_m: 'رقم البطاقة', en: 'Card number' },
  cardExpiry: { ar_m: 'تاريخ الانتهاء', en: 'Expiry' },
  cardCvc: { ar_m: 'رمز الأمان', en: 'CVC' },
  payAndRequest: { ar_m: 'ادفع واطلب', ar_f: 'ادفعي واطلبي', en: 'Pay and request' },
  testMode: {
    ar_m: 'وضع التجربة: لا تُدفع أموال حقيقية. استخدم ⁦4242 4242 4242 4242⁩ وأي تاريخ قادم وأي 3 أرقام.',
    ar_f: 'وضع التجربة: لا تُدفع أموال حقيقية. استخدمي ⁦4242 4242 4242 4242⁩ وأي تاريخ قادم وأي 3 أرقام.',
    en: 'Test mode: no real money moves. Use 4242 4242 4242 4242, any future date and any 3 digits.',
  },
  cardProblem_number: { ar_m: 'تحقق من رقم البطاقة', ar_f: 'تحققي من رقم البطاقة', en: 'Check the card number' },
  cardProblem_expiry: { ar_m: 'تحقق من تاريخ الانتهاء', ar_f: 'تحققي من تاريخ الانتهاء', en: 'Check the expiry date' },
  cardProblem_cvc: { ar_m: 'تحقق من رمز الأمان', ar_f: 'تحققي من رمز الأمان', en: 'Check the security code' },
  cardDeclined: { ar_m: 'رُفضت البطاقة. جرّب بطاقة أخرى.', ar_f: 'رُفضت البطاقة. جرّبي بطاقة أخرى.', en: 'Your card was declined. Try another card.' },
  paymentLabel: { ar_m: 'الدفع', en: 'Payment' },
  payment_held: { ar_m: 'محجوز، يُخصم عند القبول', en: 'On hold, charged when accepted' },
  payment_charged: { ar_m: 'مدفوع', en: 'Paid' },
  payment_released: { ar_m: 'أُلغي الحجز، لم يُخصم شيء', en: 'Hold released, nothing charged' },
  payment_refunded: { ar_m: 'تم استرداد المبلغ', en: 'Refunded' },
  youEarn: { ar_m: 'ستحصل على', ar_f: 'ستحصلين على', en: "You'll get" },

  somethingWrong: { ar_m: 'حدث خطأ، حاول مرة أخرى', en: 'Something went wrong, try again' },
} satisfies Record<string, Variants>;

export type StringKey = keyof typeof strings;
