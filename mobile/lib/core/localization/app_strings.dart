import 'package:flutter/material.dart';

/// Every user-facing string in the app, in Arabic and English.
///
/// The abstract members make it impossible to ship a string in one language
/// only — a missing translation is a compile-time error.
abstract class AppStrings {
  const AppStrings();

  static const LocalizationsDelegate<AppStrings> delegate = _AppStringsDelegate();

  static AppStrings of(BuildContext context) =>
      Localizations.of<AppStrings>(context, AppStrings)!;

  // ---- App / brand ----
  String get appName;
  String get tagline;

  // ---- Common ----
  String get retry;
  String get cancel;
  String get confirm;
  String get save;
  String get close;
  String get search;
  String get all;
  String get loading;
  String get somethingWentWrong;
  String get noData;
  String get viewAll;
  String get details;
  String get status;
  String get actions;
  String get yes;
  String get no;
  String get notAvailable;
  String get currency;
  String get minutes;

  // ---- Errors ----
  String get errNetwork;
  String get errTimeout;
  String get errServer;
  String get errUnauthorized;
  String get errForbidden;
  String get errNotFound;
  String get errBadRequest;
  String get errRateLimited;
  String get errUnknown;
  String get errInvalidCredentials;
  String get errSuspended;
  String get errWeakPassword;
  String get errWrongPassword;
  String get sessionExpired;

  // ---- Auth ----
  String get login;
  String get loginTitle;
  String get loginSubtitle;
  String get email;
  String get password;
  String get emailRequired;
  String get emailInvalid;
  String get passwordRequired;
  String get passwordTooShort;
  String get logout;
  String get logoutConfirmTitle;
  String get logoutConfirmBody;
  String get demoAccess;
  String get demoAccessHint;
  String get continueAsLandlord;
  String get continueAsTenant;
  String get continueAsAdmin;
  String get welcomeBack;

  // ---- Roles ----
  String get roleLandlord;
  String get roleTenant;
  String get roleAdmin;

  // ---- Navigation ----
  String get navHome;
  String get navContracts;
  String get navPayments;
  String get navProperties;
  String get navMaintenance;
  String get navRequests;
  String get navNotifications;
  String get navProfile;
  String get navMore;
  String get navServices;
  String get navDocuments;

  // ---- Home ----
  String get hello;
  String get overview;
  String get quickActions;
  String get recentActivity;

  // ---- Properties ----
  String get properties;
  String get property;
  String get noProperties;
  String get units;
  String get unit;
  String get noUnits;
  String get verified;
  String get unverified;
  String get deed;
  String get area;
  String get type;
  String get bedrooms;
  String get sizeSqm;
  String get rent;
  String get listed;
  String get notListed;

  // ---- Contracts ----
  String get contracts;
  String get contract;
  String get noContracts;
  String get contractNo;
  String get landlord;
  String get tenant;
  String get startDate;
  String get endDate;
  String get duration;
  String get months;
  String get deposit;
  String get dueDay;
  String get frequency;
  String get utilities;
  String get signedByLandlord;
  String get signedByTenant;
  String get contractDocument;
  String get viewDocument;
  String get checklist;
  String get monthly;
  String get quarterly;
  String get yearly;

  // ---- Payments ----
  String get payments;
  String get payment;
  String get noPayments;
  String get amount;
  String get dueDate;
  String get paidOn;
  String get method;
  String get receipt;
  String get payNow;
  String get paymentHistory;
  String get upcoming;
  String get overdue;
  String get paid;
  String get due;
  String get upcomingPayments;
  String get overduePayments;
  String get collectedThisMonth;
  String get expectedThisMonth;
  String get receiptDownload;
  String get methodBenefit;
  String get methodCard;
  String get methodTransfer;
  String get methodCash;
  String get payConfirmTitle;
  String get payConfirmBody;
  String get paySuccess;
  String get chooseGateway;
  String get noGatewayEnabled;
  String get testMode;
  String get paySandboxTitle;
  String get paySandboxBody;
  String get payProviderTitle;
  String get payProviderBody;
  String get payProviderOpened;
  String get feePayment;

  // ---- Refunds ----
  String get refundRequest;
  String get refundPending;
  String get refundApproved;
  String get refundRejected;
  String get refundReasonLabel;
  String get refundReasonHint;
  String get refundSend;
  String get refundSent;
  String get refundExists;
  String get refundNotAllowed;

  // ---- Maintenance ----
  String get maintenance;
  String get maintenanceRequest;
  String get noMaintenance;
  String get newRequest;
  String get requestTitle;
  String get category;
  String get priority;
  String get technician;
  String get rating;
  String get rateService;
  String get createdAt;
  String get description;
  String get submitRequest;
  String get requestSubmitted;
  String get statusNew;
  String get statusInProgress;
  String get statusDone;
  String get priorityLow;
  String get priorityNormal;
  String get priorityHigh;
  String get catPlumbing;
  String get catElectrical;
  String get catAc;
  String get catElevator;
  String get catCleaning;
  String get catOther;

  // ---- Services / requests ----
  String get services;
  String get service;
  String get noServices;
  String get myRequests;
  String get requestNo;
  String get serviceRequest;
  String get noRequests;
  String get requestService;
  String get notes;
  String get timeline;
  String get requestCreated;
  String get requestStatusNew;
  String get requestStatusAssigned;
  String get requestStatusScheduled;
  String get requestStatusInProgress;
  String get requestStatusCompleted;
  String get requestStatusCancelled;
  String get price;
  String get durationLabel;

  // ---- Notifications ----
  String get notifications;
  String get noNotifications;
  String get unread;
  String get markAllRead;
  String get markAsRead;

  // ---- Documents ----
  String get documents;
  String get noDocuments;
  String get download;
  String get openDocument;
  String get docDownloadFailed;
  String get docNoFile;

  // ---- Profile ----
  String get profile;
  String get accountInfo;
  String get fullName;
  String get phone;
  String get cpr;
  String get memberSince;
  String get language;
  String get arabic;
  String get english;
  String get appearance;
  String get themeSystem;
  String get themeLight;
  String get themeDark;
  String get changePassword;
  String get currentPassword;
  String get newPassword;
  String get passwordChanged;
  String get forgotPassword;
  String get forgotPasswordTitle;
  String get forgotPasswordIntro;
  String get sendResetLink;
  String get resetLinkSentTitle;
  String get resetLinkSentBody;
  String get backToLogin;
  String get resetPasswordTitle;
  String get resetPasswordIntro;
  String get confirmPassword;
  String get passwordMismatch;
  String get resetInvalidLink;
  String get resetExpiredLink;
  String get resetSuccess;
  String get verifyingLink;
  String get about;
  String get version;

  // ---- Admin ----
  String get adminPanel;
  String get usersCount;
  String get propertiesCount;
  String get contractsCount;
  String get paymentsCount;
  String get verifications;
  String get noPermission;
  String get adminOnly;
}

class AppStringsAr extends AppStrings {
  const AppStringsAr();

  @override
  String get appName => 'إيجاري';
  @override
  String get tagline => 'عقارك. عقدك. حقوقك.';

  @override
  String get retry => 'إعادة المحاولة';
  @override
  String get cancel => 'إلغاء';
  @override
  String get confirm => 'تأكيد';
  @override
  String get save => 'حفظ';
  @override
  String get close => 'إغلاق';
  @override
  String get search => 'بحث';
  @override
  String get all => 'الكل';
  @override
  String get loading => 'جارٍ التحميل…';
  @override
  String get somethingWentWrong => 'حدث خطأ غير متوقع';
  @override
  String get noData => 'لا توجد بيانات';
  @override
  String get viewAll => 'عرض الكل';
  @override
  String get details => 'التفاصيل';
  @override
  String get status => 'الحالة';
  @override
  String get actions => 'إجراءات';
  @override
  String get yes => 'نعم';
  @override
  String get no => 'لا';
  @override
  String get notAvailable => 'غير متاح';
  @override
  String get currency => 'د.ب';
  @override
  String get minutes => 'دقيقة';

  @override
  String get errNetwork => 'تعذّر الاتصال بالخادم. تحقّق من اتصالك بالإنترنت.';
  @override
  String get errTimeout => 'انتهت مهلة الاتصال. حاول مرة أخرى.';
  @override
  String get errServer => 'حدث خطأ في الخادم. حاول لاحقاً.';
  @override
  String get errUnauthorized => 'انتهت الجلسة. يرجى تسجيل الدخول من جديد.';
  @override
  String get errForbidden => 'لا تملك صلاحية الوصول إلى هذا المحتوى.';
  @override
  String get errNotFound => 'المحتوى المطلوب غير موجود.';
  @override
  String get errBadRequest => 'الطلب غير صالح.';
  @override
  String get errRateLimited => 'محاولات كثيرة. يرجى المحاولة بعد قليل.';
  @override
  String get errUnknown => 'حدث خطأ غير معروف.';
  @override
  String get errInvalidCredentials => 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
  @override
  String get errSuspended => 'هذا الحساب موقوف. تواصل مع الدعم.';
  @override
  String get errWeakPassword => 'كلمة المرور يجب أن تكون 8 أحرف على الأقل.';
  @override
  String get errWrongPassword => 'كلمة المرور الحالية غير صحيحة.';
  @override
  String get sessionExpired => 'انتهت صلاحية الجلسة. يرجى تسجيل الدخول من جديد.';

  @override
  String get login => 'تسجيل الدخول';
  @override
  String get loginTitle => 'مرحباً بعودتك';
  @override
  String get loginSubtitle => 'سجّل الدخول لمتابعة عقودك ومدفوعاتك';
  @override
  String get email => 'البريد الإلكتروني';
  @override
  String get password => 'كلمة المرور';
  @override
  String get emailRequired => 'البريد الإلكتروني مطلوب';
  @override
  String get emailInvalid => 'صيغة البريد الإلكتروني غير صحيحة';
  @override
  String get passwordRequired => 'كلمة المرور مطلوبة';
  @override
  String get passwordTooShort => 'كلمة المرور يجب أن تكون 8 أحرف على الأقل';
  @override
  String get logout => 'تسجيل الخروج';
  @override
  String get logoutConfirmTitle => 'تسجيل الخروج';
  @override
  String get logoutConfirmBody => 'هل تريد تسجيل الخروج من التطبيق؟';
  @override
  String get demoAccess => 'حساب تجريبي';
  @override
  String get demoAccessHint => 'استكشف التطبيق بحساب تجريبي دون تسجيل';
  @override
  String get continueAsLandlord => 'الدخول كمؤجر';
  @override
  String get continueAsTenant => 'الدخول كمستأجر';
  @override
  String get continueAsAdmin => 'الدخول كإدارة';
  @override
  String get welcomeBack => 'مرحباً بعودتك';

  @override
  String get roleLandlord => 'مؤجر';
  @override
  String get roleTenant => 'مستأجر';
  @override
  String get roleAdmin => 'إدارة';

  @override
  String get navHome => 'الرئيسية';
  @override
  String get navContracts => 'العقود';
  @override
  String get navPayments => 'المدفوعات';
  @override
  String get navProperties => 'العقارات';
  @override
  String get navMaintenance => 'الصيانة';
  @override
  String get navRequests => 'الطلبات';
  @override
  String get navNotifications => 'الإشعارات';
  @override
  String get navProfile => 'حسابي';
  @override
  String get navMore => 'المزيد';
  @override
  String get navServices => 'الخدمات';
  @override
  String get navDocuments => 'المستندات';

  @override
  String get hello => 'مرحباً';
  @override
  String get overview => 'نظرة عامة';
  @override
  String get quickActions => 'إجراءات سريعة';
  @override
  String get recentActivity => 'النشاط الأخير';

  @override
  String get properties => 'العقارات';
  @override
  String get property => 'العقار';
  @override
  String get noProperties => 'لا توجد عقارات مسجّلة';
  @override
  String get units => 'الوحدات';
  @override
  String get unit => 'الوحدة';
  @override
  String get noUnits => 'لا توجد وحدات';
  @override
  String get verified => 'موثّق';
  @override
  String get unverified => 'غير موثّق';
  @override
  String get deed => 'رقم الصك';
  @override
  String get area => 'المنطقة';
  @override
  String get type => 'النوع';
  @override
  String get bedrooms => 'غرف النوم';
  @override
  String get sizeSqm => 'المساحة (م²)';
  @override
  String get rent => 'الإيجار';
  @override
  String get listed => 'معروضة';
  @override
  String get notListed => 'غير معروضة';

  @override
  String get contracts => 'العقود';
  @override
  String get contract => 'العقد';
  @override
  String get noContracts => 'لا توجد عقود متاحة حالياً';
  @override
  String get contractNo => 'رقم العقد';
  @override
  String get landlord => 'المؤجر';
  @override
  String get tenant => 'المستأجر';
  @override
  String get startDate => 'تاريخ البدء';
  @override
  String get endDate => 'تاريخ الانتهاء';
  @override
  String get duration => 'المدة';
  @override
  String get months => 'شهراً';
  @override
  String get deposit => 'التأمين';
  @override
  String get dueDay => 'يوم الاستحقاق';
  @override
  String get frequency => 'دورية الدفع';
  @override
  String get utilities => 'يشمل المرافق';
  @override
  String get signedByLandlord => 'موقّع من المؤجر';
  @override
  String get signedByTenant => 'موقّع من المستأجر';
  @override
  String get contractDocument => 'مستند العقد';
  @override
  String get viewDocument => 'عرض المستند';
  @override
  String get checklist => 'قائمة الاستلام';
  @override
  String get monthly => 'شهري';
  @override
  String get quarterly => 'ربع سنوي';
  @override
  String get yearly => 'سنوي';

  @override
  String get payments => 'المدفوعات';
  @override
  String get payment => 'دفعة';
  @override
  String get noPayments => 'لا توجد مدفوعات';
  @override
  String get amount => 'المبلغ';
  @override
  String get dueDate => 'تاريخ الاستحقاق';
  @override
  String get paidOn => 'تاريخ الدفع';
  @override
  String get method => 'وسيلة الدفع';
  @override
  String get receipt => 'الإيصال';
  @override
  String get payNow => 'ادفع الآن';
  @override
  String get paymentHistory => 'سجل المدفوعات';
  @override
  String get upcoming => 'قادمة';
  @override
  String get overdue => 'متأخرة';
  @override
  String get paid => 'مدفوعة';
  @override
  String get due => 'مستحقة';
  @override
  String get upcomingPayments => 'مدفوعات قادمة';
  @override
  String get overduePayments => 'مدفوعات متأخرة';
  @override
  String get collectedThisMonth => 'المحصّل هذا الشهر';
  @override
  String get expectedThisMonth => 'المتوقع هذا الشهر';
  @override
  String get receiptDownload => 'تنزيل الإيصال';
  @override
  String get methodBenefit => 'بنفاذ';
  @override
  String get methodCard => 'بطاقة';
  @override
  String get methodTransfer => 'تحويل بنكي';
  @override
  String get methodCash => 'نقداً';
  @override
  String get payConfirmTitle => 'تأكيد الدفع';
  @override
  String get payConfirmBody => 'سيتم تسجيل هذه الدفعة كمدفوعة في المنصة.';
  @override
  String get paySuccess => 'تم تسجيل الدفعة بنجاح';
  @override
  String get chooseGateway => 'اختر بوابة الدفع';
  @override
  String get noGatewayEnabled => 'لا توجد بوابة دفع مفعّلة. تواصل مع الإدارة.';
  @override
  String get testMode => 'وضع الاختبار';
  @override
  String get paySandboxTitle => 'تأكيد الدفع';
  @override
  String get paySandboxBody => 'هذه بوابة اختبار. لا تُدخل بيانات بطاقة حقيقية. سيتم تأكيد الدفع عبر الخادم.';
  @override
  String get payProviderTitle => 'إتمام الدفع';
  @override
  String get payProviderBody => 'سيتم تحويلك إلى صفحة المزوّد لإتمام الدفع. يُحدَّث السداد تلقائياً عند تأكيد البوابة.';
  @override
  String get payProviderOpened => 'أكمل الدفع في صفحة البوابة، ثم عد للتحقق من الحالة.';
  @override
  String get feePayment => 'رسوم';

  @override
  String get refundRequest => 'طلب استرجاع';
  @override
  String get refundPending => 'قيد المراجعة';
  @override
  String get refundApproved => 'تم الاعتماد';
  @override
  String get refundRejected => 'مرفوض';
  @override
  String get refundReasonLabel => 'السبب';
  @override
  String get refundReasonHint => 'اذكر سبب طلب الاسترجاع…';
  @override
  String get refundSend => 'إرسال الطلب';
  @override
  String get refundSent => 'تم إرسال طلب الاسترجاع إلى الإدارة للمراجعة.';
  @override
  String get refundExists => 'يوجد طلب استرجاع سابق لهذه الدفعة قيد المراجعة أو معتمد.';
  @override
  String get refundNotAllowed => 'لا يمكن طلب استرجاع لهذه الدفعة.';

  @override
  String get maintenance => 'الصيانة';
  @override
  String get maintenanceRequest => 'طلب صيانة';
  @override
  String get noMaintenance => 'لا توجد طلبات صيانة';
  @override
  String get newRequest => 'طلب جديد';
  @override
  String get requestTitle => 'عنوان الطلب';
  @override
  String get category => 'التصنيف';
  @override
  String get priority => 'الأولوية';
  @override
  String get technician => 'الفني';
  @override
  String get rating => 'التقييم';
  @override
  String get rateService => 'قيّم الخدمة';
  @override
  String get createdAt => 'تاريخ الإنشاء';
  @override
  String get description => 'الوصف';
  @override
  String get submitRequest => 'إرسال الطلب';
  @override
  String get requestSubmitted => 'تم إرسال الطلب بنجاح';
  @override
  String get statusNew => 'جديد';
  @override
  String get statusInProgress => 'قيد التنفيذ';
  @override
  String get statusDone => 'مكتمل';
  @override
  String get priorityLow => 'منخفضة';
  @override
  String get priorityNormal => 'عادية';
  @override
  String get priorityHigh => 'عالية';
  @override
  String get catPlumbing => 'سباكة';
  @override
  String get catElectrical => 'كهرباء';
  @override
  String get catAc => 'تكييف';
  @override
  String get catElevator => 'مصعد';
  @override
  String get catCleaning => 'تنظيف';
  @override
  String get catOther => 'أخرى';

  @override
  String get services => 'الخدمات';
  @override
  String get service => 'خدمة';
  @override
  String get noServices => 'لا توجد خدمات متاحة';
  @override
  String get myRequests => 'طلباتي';
  @override
  String get requestNo => 'رقم الطلب';
  @override
  String get serviceRequest => 'طلب خدمة';
  @override
  String get noRequests => 'لا توجد طلبات';
  @override
  String get requestService => 'اطلب الخدمة';
  @override
  String get notes => 'ملاحظات';
  @override
  String get timeline => 'مسار الطلب';
  @override
  String get requestCreated => 'تم إنشاء الطلب';
  @override
  String get requestStatusNew => 'جديد';
  @override
  String get requestStatusAssigned => 'تم التعيين';
  @override
  String get requestStatusScheduled => 'مجدول';
  @override
  String get requestStatusInProgress => 'قيد التنفيذ';
  @override
  String get requestStatusCompleted => 'مكتمل';
  @override
  String get requestStatusCancelled => 'ملغى';
  @override
  String get price => 'السعر';
  @override
  String get durationLabel => 'المدة';

  @override
  String get notifications => 'الإشعارات';
  @override
  String get noNotifications => 'لا توجد إشعارات';
  @override
  String get unread => 'غير مقروء';
  @override
  String get markAllRead => 'تعليم الكل كمقروء';
  @override
  String get markAsRead => 'تعليم كمقروء';

  @override
  String get documents => 'المستندات';
  @override
  String get noDocuments => 'لا توجد مستندات';
  @override
  String get download => 'تنزيل';
  @override
  String get openDocument => 'فتح المستند';
  @override
  String get docDownloadFailed => 'تعذّر تنزيل المستند';
  @override
  String get docNoFile => 'لا يوجد ملف مرفق لهذا المستند';

  @override
  String get profile => 'حسابي';
  @override
  String get accountInfo => 'بيانات الحساب';
  @override
  String get fullName => 'الاسم';
  @override
  String get phone => 'الهاتف';
  @override
  String get cpr => 'الرقم الشخصي';
  @override
  String get memberSince => 'عضو منذ';
  @override
  String get language => 'اللغة';
  @override
  String get arabic => 'العربية';
  @override
  String get english => 'English';
  @override
  String get appearance => 'المظهر';
  @override
  String get themeSystem => 'حسب النظام';
  @override
  String get themeLight => 'فاتح';
  @override
  String get themeDark => 'داكن';
  @override
  String get changePassword => 'تغيير كلمة المرور';
  @override
  String get currentPassword => 'كلمة المرور الحالية';
  @override
  String get newPassword => 'كلمة المرور الجديدة';
  @override
  String get passwordChanged => 'تم تغيير كلمة المرور بنجاح';
  @override
  String get forgotPassword => 'نسيت كلمة المرور؟';
  @override
  String get forgotPasswordTitle => 'إعادة تعيين كلمة المرور';
  @override
  String get forgotPasswordIntro => 'أدخل بريدك الإلكتروني وسنرسل لك رابطاً لإعادة تعيين كلمة المرور إن كان الحساب موجوداً.';
  @override
  String get sendResetLink => 'إرسال رابط الإعادة';
  @override
  String get resetLinkSentTitle => 'تحقّق من بريدك';
  @override
  String get resetLinkSentBody => 'إذا كان هذا البريد مسجّلاً لدينا، فسيصلك رابط لإعادة تعيين كلمة المرور خلال دقائق.';
  @override
  String get backToLogin => 'العودة لتسجيل الدخول';
  @override
  String get resetPasswordTitle => 'تعيين كلمة مرور جديدة';
  @override
  String get resetPasswordIntro => 'اختر كلمة مرور جديدة لحسابك.';
  @override
  String get confirmPassword => 'تأكيد كلمة المرور';
  @override
  String get passwordMismatch => 'كلمتا المرور غير متطابقتين.';
  @override
  String get resetInvalidLink => 'رابط إعادة التعيين غير صالح أو مُستخدَم. اطلب رابطاً جديداً.';
  @override
  String get resetExpiredLink => 'انتهت صلاحية رابط إعادة التعيين. اطلب رابطاً جديداً.';
  @override
  String get resetSuccess => 'تم تعيين كلمة المرور. يمكنك تسجيل الدخول الآن.';
  @override
  String get verifyingLink => 'جارٍ التحقق من الرابط…';
  @override
  String get about => 'عن التطبيق';
  @override
  String get version => 'الإصدار';

  @override
  String get adminPanel => 'لوحة الإدارة';
  @override
  String get usersCount => 'المستخدمون';
  @override
  String get propertiesCount => 'العقارات';
  @override
  String get contractsCount => 'العقود';
  @override
  String get paymentsCount => 'المدفوعات';
  @override
  String get verifications => 'طلبات التوثيق';
  @override
  String get noPermission => 'لا تملك صلاحية لهذا الإجراء';
  @override
  String get adminOnly => 'متاح للإدارة فقط';
}

class AppStringsEn extends AppStrings {
  const AppStringsEn();

  @override
  String get appName => 'Ejari';
  @override
  String get tagline => 'Your property. Your lease. Your rights.';

  @override
  String get retry => 'Retry';
  @override
  String get cancel => 'Cancel';
  @override
  String get confirm => 'Confirm';
  @override
  String get save => 'Save';
  @override
  String get close => 'Close';
  @override
  String get search => 'Search';
  @override
  String get all => 'All';
  @override
  String get loading => 'Loading…';
  @override
  String get somethingWentWrong => 'Something went wrong';
  @override
  String get noData => 'No data';
  @override
  String get viewAll => 'View all';
  @override
  String get details => 'Details';
  @override
  String get status => 'Status';
  @override
  String get actions => 'Actions';
  @override
  String get yes => 'Yes';
  @override
  String get no => 'No';
  @override
  String get notAvailable => 'Not available';
  @override
  String get currency => 'BD';
  @override
  String get minutes => 'min';

  @override
  String get errNetwork => 'Could not reach the server. Check your internet connection.';
  @override
  String get errTimeout => 'The request timed out. Please try again.';
  @override
  String get errServer => 'A server error occurred. Please try again later.';
  @override
  String get errUnauthorized => 'Your session expired. Please sign in again.';
  @override
  String get errForbidden => 'You do not have permission to access this content.';
  @override
  String get errNotFound => 'The requested content was not found.';
  @override
  String get errBadRequest => 'The request was invalid.';
  @override
  String get errRateLimited => 'Too many attempts. Please try again shortly.';
  @override
  String get errUnknown => 'An unknown error occurred.';
  @override
  String get errInvalidCredentials => 'Incorrect email or password.';
  @override
  String get errSuspended => 'This account is suspended. Please contact support.';
  @override
  String get errWeakPassword => 'The password must be at least 8 characters.';
  @override
  String get errWrongPassword => 'The current password is incorrect.';
  @override
  String get sessionExpired => 'Your session expired. Please sign in again.';

  @override
  String get login => 'Sign in';
  @override
  String get loginTitle => 'Welcome back';
  @override
  String get loginSubtitle => 'Sign in to follow your leases and payments';
  @override
  String get email => 'Email';
  @override
  String get password => 'Password';
  @override
  String get emailRequired => 'Email is required';
  @override
  String get emailInvalid => 'Enter a valid email address';
  @override
  String get passwordRequired => 'Password is required';
  @override
  String get passwordTooShort => 'Password must be at least 8 characters';
  @override
  String get logout => 'Sign out';
  @override
  String get logoutConfirmTitle => 'Sign out';
  @override
  String get logoutConfirmBody => 'Do you want to sign out of the app?';
  @override
  String get demoAccess => 'Demo account';
  @override
  String get demoAccessHint => 'Explore the app with a demo account, no sign-up';
  @override
  String get continueAsLandlord => 'Continue as landlord';
  @override
  String get continueAsTenant => 'Continue as tenant';
  @override
  String get continueAsAdmin => 'Continue as admin';
  @override
  String get welcomeBack => 'Welcome back';

  @override
  String get roleLandlord => 'Landlord';
  @override
  String get roleTenant => 'Tenant';
  @override
  String get roleAdmin => 'Administration';

  @override
  String get navHome => 'Home';
  @override
  String get navContracts => 'Contracts';
  @override
  String get navPayments => 'Payments';
  @override
  String get navProperties => 'Properties';
  @override
  String get navMaintenance => 'Maintenance';
  @override
  String get navRequests => 'Requests';
  @override
  String get navNotifications => 'Notifications';
  @override
  String get navProfile => 'Profile';
  @override
  String get navMore => 'More';
  @override
  String get navServices => 'Services';
  @override
  String get navDocuments => 'Documents';

  @override
  String get hello => 'Hello';
  @override
  String get overview => 'Overview';
  @override
  String get quickActions => 'Quick actions';
  @override
  String get recentActivity => 'Recent activity';

  @override
  String get properties => 'Properties';
  @override
  String get property => 'Property';
  @override
  String get noProperties => 'No properties registered';
  @override
  String get units => 'Units';
  @override
  String get unit => 'Unit';
  @override
  String get noUnits => 'No units';
  @override
  String get verified => 'Verified';
  @override
  String get unverified => 'Unverified';
  @override
  String get deed => 'Deed number';
  @override
  String get area => 'Area';
  @override
  String get type => 'Type';
  @override
  String get bedrooms => 'Bedrooms';
  @override
  String get sizeSqm => 'Size (m²)';
  @override
  String get rent => 'Rent';
  @override
  String get listed => 'Listed';
  @override
  String get notListed => 'Not listed';

  @override
  String get contracts => 'Contracts';
  @override
  String get contract => 'Contract';
  @override
  String get noContracts => 'No contracts available.';
  @override
  String get contractNo => 'Contract no.';
  @override
  String get landlord => 'Landlord';
  @override
  String get tenant => 'Tenant';
  @override
  String get startDate => 'Start date';
  @override
  String get endDate => 'End date';
  @override
  String get duration => 'Duration';
  @override
  String get months => 'months';
  @override
  String get deposit => 'Deposit';
  @override
  String get dueDay => 'Due day';
  @override
  String get frequency => 'Payment frequency';
  @override
  String get utilities => 'Utilities included';
  @override
  String get signedByLandlord => 'Signed by landlord';
  @override
  String get signedByTenant => 'Signed by tenant';
  @override
  String get contractDocument => 'Contract document';
  @override
  String get viewDocument => 'View document';
  @override
  String get checklist => 'Handover checklist';
  @override
  String get monthly => 'Monthly';
  @override
  String get quarterly => 'Quarterly';
  @override
  String get yearly => 'Yearly';

  @override
  String get payments => 'Payments';
  @override
  String get payment => 'Payment';
  @override
  String get noPayments => 'No payments';
  @override
  String get amount => 'Amount';
  @override
  String get dueDate => 'Due date';
  @override
  String get paidOn => 'Paid on';
  @override
  String get method => 'Method';
  @override
  String get receipt => 'Receipt';
  @override
  String get payNow => 'Pay now';
  @override
  String get paymentHistory => 'Payment history';
  @override
  String get upcoming => 'Upcoming';
  @override
  String get overdue => 'Overdue';
  @override
  String get paid => 'Paid';
  @override
  String get due => 'Due';
  @override
  String get upcomingPayments => 'Upcoming payments';
  @override
  String get overduePayments => 'Overdue payments';
  @override
  String get collectedThisMonth => 'Collected this month';
  @override
  String get expectedThisMonth => 'Expected this month';
  @override
  String get receiptDownload => 'Download receipt';
  @override
  String get methodBenefit => 'BenefitPay';
  @override
  String get methodCard => 'Card';
  @override
  String get methodTransfer => 'Bank transfer';
  @override
  String get methodCash => 'Cash';
  @override
  String get payConfirmTitle => 'Confirm payment';
  @override
  String get payConfirmBody => 'This payment will be recorded as paid on the platform.';
  @override
  String get paySuccess => 'Payment recorded successfully';
  @override
  String get chooseGateway => 'Choose a payment gateway';
  @override
  String get noGatewayEnabled => 'No payment gateway is enabled. Please contact the administrator.';
  @override
  String get testMode => 'Test mode';
  @override
  String get paySandboxTitle => 'Confirm payment';
  @override
  String get paySandboxBody => 'This is a test gateway. Do not enter real card details. The payment is confirmed server-side.';
  @override
  String get payProviderTitle => 'Complete payment';
  @override
  String get payProviderBody => 'You will be sent to the provider page to complete payment. It updates automatically once the gateway confirms.';
  @override
  String get payProviderOpened => 'Complete the payment on the provider page, then return to check the status.';
  @override
  String get feePayment => 'Fee';

  @override
  String get refundRequest => 'Request a refund';
  @override
  String get refundPending => 'Under review';
  @override
  String get refundApproved => 'Approved';
  @override
  String get refundRejected => 'Rejected';
  @override
  String get refundReasonLabel => 'Reason';
  @override
  String get refundReasonHint => 'Describe why you are requesting a refund…';
  @override
  String get refundSend => 'Send request';
  @override
  String get refundSent => 'Your refund request was sent to the administration for review.';
  @override
  String get refundExists => 'A refund request for this payment is already pending or approved.';
  @override
  String get refundNotAllowed => 'A refund cannot be requested for this payment.';

  @override
  String get maintenance => 'Maintenance';
  @override
  String get maintenanceRequest => 'Maintenance request';
  @override
  String get noMaintenance => 'No maintenance requests';
  @override
  String get newRequest => 'New request';
  @override
  String get requestTitle => 'Request title';
  @override
  String get category => 'Category';
  @override
  String get priority => 'Priority';
  @override
  String get technician => 'Technician';
  @override
  String get rating => 'Rating';
  @override
  String get rateService => 'Rate the service';
  @override
  String get createdAt => 'Created';
  @override
  String get description => 'Description';
  @override
  String get submitRequest => 'Submit request';
  @override
  String get requestSubmitted => 'Request submitted successfully';
  @override
  String get statusNew => 'New';
  @override
  String get statusInProgress => 'In progress';
  @override
  String get statusDone => 'Completed';
  @override
  String get priorityLow => 'Low';
  @override
  String get priorityNormal => 'Normal';
  @override
  String get priorityHigh => 'High';
  @override
  String get catPlumbing => 'Plumbing';
  @override
  String get catElectrical => 'Electrical';
  @override
  String get catAc => 'Air conditioning';
  @override
  String get catElevator => 'Elevator';
  @override
  String get catCleaning => 'Cleaning';
  @override
  String get catOther => 'Other';

  @override
  String get services => 'Services';
  @override
  String get service => 'Service';
  @override
  String get noServices => 'No services available';
  @override
  String get myRequests => 'My requests';
  @override
  String get requestNo => 'Request no.';
  @override
  String get serviceRequest => 'Service request';
  @override
  String get noRequests => 'No requests';
  @override
  String get requestService => 'Request service';
  @override
  String get notes => 'Notes';
  @override
  String get timeline => 'Request timeline';
  @override
  String get requestCreated => 'Request created';
  @override
  String get requestStatusNew => 'New';
  @override
  String get requestStatusAssigned => 'Assigned';
  @override
  String get requestStatusScheduled => 'Scheduled';
  @override
  String get requestStatusInProgress => 'In progress';
  @override
  String get requestStatusCompleted => 'Completed';
  @override
  String get requestStatusCancelled => 'Cancelled';
  @override
  String get price => 'Price';
  @override
  String get durationLabel => 'Duration';

  @override
  String get notifications => 'Notifications';
  @override
  String get noNotifications => 'No notifications';
  @override
  String get unread => 'Unread';
  @override
  String get markAllRead => 'Mark all as read';
  @override
  String get markAsRead => 'Mark as read';

  @override
  String get documents => 'Documents';
  @override
  String get noDocuments => 'No documents';
  @override
  String get download => 'Download';
  @override
  String get openDocument => 'Open document';
  @override
  String get docDownloadFailed => 'Could not download the document';
  @override
  String get docNoFile => 'No file is attached to this document';

  @override
  String get profile => 'Profile';
  @override
  String get accountInfo => 'Account information';
  @override
  String get fullName => 'Name';
  @override
  String get phone => 'Phone';
  @override
  String get cpr => 'CPR';
  @override
  String get memberSince => 'Member since';
  @override
  String get language => 'Language';
  @override
  String get arabic => 'العربية';
  @override
  String get english => 'English';
  @override
  String get appearance => 'Appearance';
  @override
  String get themeSystem => 'System';
  @override
  String get themeLight => 'Light';
  @override
  String get themeDark => 'Dark';
  @override
  String get changePassword => 'Change password';
  @override
  String get currentPassword => 'Current password';
  @override
  String get newPassword => 'New password';
  @override
  String get passwordChanged => 'Password changed successfully';
  @override
  String get forgotPassword => 'Forgot password?';
  @override
  String get forgotPasswordTitle => 'Reset your password';
  @override
  String get forgotPasswordIntro => 'Enter your email and we will send a reset link if the account exists.';
  @override
  String get sendResetLink => 'Send reset link';
  @override
  String get resetLinkSentTitle => 'Check your email';
  @override
  String get resetLinkSentBody => 'If this email is registered, a password reset link will arrive within minutes.';
  @override
  String get backToLogin => 'Back to sign in';
  @override
  String get resetPasswordTitle => 'Set a new password';
  @override
  String get resetPasswordIntro => 'Choose a new password for your account.';
  @override
  String get confirmPassword => 'Confirm password';
  @override
  String get passwordMismatch => 'The passwords do not match.';
  @override
  String get resetInvalidLink => 'This reset link is invalid or already used. Request a new one.';
  @override
  String get resetExpiredLink => 'This reset link has expired. Request a new one.';
  @override
  String get resetSuccess => 'Your password was set. You can sign in now.';
  @override
  String get verifyingLink => 'Verifying the link…';
  @override
  String get about => 'About';
  @override
  String get version => 'Version';

  @override
  String get adminPanel => 'Admin panel';
  @override
  String get usersCount => 'Users';
  @override
  String get propertiesCount => 'Properties';
  @override
  String get contractsCount => 'Contracts';
  @override
  String get paymentsCount => 'Payments';
  @override
  String get verifications => 'Verification requests';
  @override
  String get noPermission => 'You do not have permission for this action';
  @override
  String get adminOnly => 'Available to administration only';
}

class _AppStringsDelegate extends LocalizationsDelegate<AppStrings> {
  const _AppStringsDelegate();

  @override
  bool isSupported(Locale locale) => const ['ar', 'en'].contains(locale.languageCode);

  @override
  Future<AppStrings> load(Locale locale) async =>
      locale.languageCode == 'ar' ? const AppStringsAr() : const AppStringsEn();

  @override
  bool shouldReload(_AppStringsDelegate old) => false;
}
