const ISO_8601_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const ISO_8601_EXAMPLE = '2026-01-20T00:00:00Z';
const EVENT_TYPE_URI_EXAMPLE = 'https://api.calendly.com/event_types/AAAAAAAAAAAAAAAA';
const TIMEZONE_EXAMPLE = 'America/New_York';
const EMAIL_EXAMPLE = 'invitee@example.com';
const E164_PHONE_REGEX = /^\+[1-9]\d{6,14}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ScheduleEventCmdOptions = {
	raw?: string;
	eventType?: string;
	startTime?: string;
	inviteeName?: string;
	inviteeFirstName?: string;
	inviteeLastName?: string;
	inviteeEmail?: string;
	inviteeTimezone?: string;
	inviteePhone?: string;
	locationKind?: string;
	locationDetails?: string;
	eventGuest?: string[];
	questionsAndAnswers?: string;
	questions?: string;
	utmSource?: string;
	utmCampaign?: string;
	utmMedium?: string;
};

export type ScheduleQuestionAndAnswer = {
	question: string;
	answer: string;
	position: number;
};

export type ScheduleEventQuery = {
	event_type: string;
	start_time: string;
	invitee_email: string;
	invitee_timezone: string;
	invitee_name?: string;
	invitee_first_name?: string;
	invitee_last_name?: string;
	invitee_phone?: string;
	location_kind?: string;
	location_details?: string;
	event_guests?: string[];
	questions_and_answers?: ScheduleQuestionAndAnswer[];
	utm_source?: string;
	utm_campaign?: string;
	utm_medium?: string;
};

function toRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' ? { ...(value as Record<string, unknown>) } : {};
}

function normalizeRequiredString(value: unknown, fieldName: string, requiredMessage: string): string {
	if (value === undefined || value === null) {
		throw new Error(requiredMessage);
	}
	if (typeof value !== 'string') {
		throw new Error(`${fieldName} must be a non-empty string`);
	}
	const trimmed = value.trim();
	if (!trimmed) {
		throw new Error(`${fieldName} must be a non-empty string`);
	}
	return trimmed;
}

function normalizeOptionalString(value: unknown, fieldName: string): string | undefined {
	if (value === undefined || value === null) {
		return undefined;
	}
	if (typeof value !== 'string') {
		throw new Error(`${fieldName} must be a non-empty string`);
	}
	const trimmed = value.trim();
	if (!trimmed) {
		throw new Error(`${fieldName} must be a non-empty string`);
	}
	return trimmed;
}

function normalizeEventType(value: unknown): string {
	const eventType = normalizeRequiredString(
		value,
		'event_type',
		'event_type is required (use --event-type or --raw {"event_type":"..."})'
	);
	if (!eventType.includes('/event_types/')) {
		throw new Error(`event_type must be a Calendly event type URI (example: ${EVENT_TYPE_URI_EXAMPLE})`);
	}
	return eventType;
}

function normalizeStartTime(value: unknown): string {
	const startTime = normalizeRequiredString(
		value,
		'start_time',
		'start_time is required (use --start-time or --raw {"start_time":"..."})'
	);
	if (!ISO_8601_TIMESTAMP.test(startTime) || Number.isNaN(Date.parse(startTime))) {
		throw new Error(`start_time must be a valid ISO-8601 timestamp (example: ${ISO_8601_EXAMPLE})`);
	}
	if (Date.parse(startTime) <= Date.now()) {
		throw new Error('start_time must be in the future');
	}
	return startTime;
}

function normalizeEmail(value: unknown, fieldName: string, requiredMessage: string): string {
	const email = normalizeRequiredString(value, fieldName, requiredMessage).toLowerCase();
	if (!EMAIL_REGEX.test(email)) {
		throw new Error(`${fieldName} must be a valid email address (example: ${EMAIL_EXAMPLE})`);
	}
	return email;
}

function normalizeTimezone(value: unknown): string {
	const timezone = normalizeRequiredString(
		value,
		'invitee_timezone',
		'invitee_timezone is required (use --invitee-timezone or --raw {"invitee_timezone":"..."})'
	);
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
	} catch {
		throw new Error(`invitee_timezone must be a valid IANA timezone (example: ${TIMEZONE_EXAMPLE})`);
	}
	return timezone;
}

function normalizePhone(value: unknown): string | undefined {
	const phone = normalizeOptionalString(value, 'invitee_phone');
	if (!phone) {
		return undefined;
	}
	if (!E164_PHONE_REGEX.test(phone)) {
		throw new Error('invitee_phone must be a valid E.164 phone number (example: +14155551234)');
	}
	return phone;
}

function parseJsonOption(value: unknown, fieldName: string): unknown {
	if (value === undefined || value === null) {
		return undefined;
	}
	if (typeof value !== 'string') {
		return value;
	}
	const trimmed = value.trim();
	if (!trimmed) {
		return undefined;
	}
	try {
		return JSON.parse(trimmed);
	} catch {
		throw new Error(`${fieldName} must be valid JSON`);
	}
}

function normalizeQuestionAndAnswerEntry(value: unknown, index: number): ScheduleQuestionAndAnswer {
	const record = toRecord(value);
	const question = normalizeRequiredString(
		record.question ?? record.question_id ?? record.id,
		'questions_and_answers.question',
		'questions_and_answers entries require question and answer fields'
	);
	const answerRaw = record.answer ?? record.value;
	const answer = normalizeRequiredString(
		typeof answerRaw === 'string' ? answerRaw : answerRaw !== undefined && answerRaw !== null ? String(answerRaw) : undefined,
		'questions_and_answers.answer',
		'questions_and_answers entries require question and answer fields'
	);
	const positionRaw = record.position;
	const position =
		typeof positionRaw === 'number' && Number.isFinite(positionRaw) && Number.isInteger(positionRaw) && positionRaw > 0
			? positionRaw
			: index + 1;
	return {
		question,
		answer,
		position,
	};
}

function normalizeQuestionsAndAnswers(value: unknown): ScheduleQuestionAndAnswer[] | undefined {
	if (value === undefined || value === null) {
		return undefined;
	}
	if (Array.isArray(value)) {
		if (value.length === 0) {
			return undefined;
		}
		return value.map((entry, index) => normalizeQuestionAndAnswerEntry(entry, index));
	}
	if (value && typeof value === 'object') {
		const record = value as Record<string, unknown>;
		if ('question' in record || 'answer' in record || 'question_id' in record || 'id' in record) {
			return [normalizeQuestionAndAnswerEntry(record, 0)];
		}
		const entries = Object.entries(record).map(([question, answer], index) =>
			normalizeQuestionAndAnswerEntry({ question, answer, position: index + 1 }, index)
		);
		return entries.length > 0 ? entries : undefined;
	}
	throw new Error('questions_and_answers must be a JSON object or array');
}

function normalizeEventGuests(value: unknown): string[] | undefined {
	if (value === undefined || value === null) {
		return undefined;
	}
	const candidates: unknown[] = Array.isArray(value) ? value : [value];
	const normalized: string[] = [];
	for (const candidate of candidates) {
		const email = normalizeEmail(
			candidate,
			'event_guests',
			'event_guests must be email strings (use repeated --event-guest or --raw {"event_guests":["..."]})'
		);
		if (!normalized.includes(email)) {
			normalized.push(email);
		}
	}
	if (normalized.length === 0) {
		return undefined;
	}
	if (normalized.length > 10) {
		throw new Error('event_guests cannot include more than 10 email addresses');
	}
	return normalized;
}

function trimErrorDetail(value: string): string {
	return value.replace(/\s+/g, ' ').trim().slice(0, 300);
}

function extractErrorDetail(data: unknown): string | undefined {
	const record = toRecord(data);
	const candidates = [
		record.message,
		record.title,
		record.detail,
		record.error,
		toRecord(record.resource)?.message,
	];
	for (const candidate of candidates) {
		if (typeof candidate === 'string' && candidate.trim()) {
			return trimErrorDetail(candidate);
		}
	}
	const details = Array.isArray(record.details) ? record.details : [];
	for (const entry of details) {
		const message = toRecord(entry).message;
		if (typeof message === 'string' && message.trim()) {
			return trimErrorDetail(message);
		}
	}
	return undefined;
}

function parseUuidFromUri(uri: string | undefined, segment: string): string | undefined {
	if (!uri) {
		return undefined;
	}
	const regex = new RegExp(`/${segment}/([^/?#]+)(?:[/?#]|$)`);
	const match = uri.match(regex);
	return match && match[1] ? match[1] : undefined;
}

function pickString(...values: unknown[]): string | undefined {
	for (const value of values) {
		if (typeof value === 'string' && value.trim()) {
			return value;
		}
	}
	return undefined;
}

export function normalizeScheduleEventQuery(
	cmdOpts: ScheduleEventCmdOptions,
	defaults: Record<string, unknown> = {}
): ScheduleEventQuery {
	const rawInvitee = toRecord(defaults.invitee);
	const rawLocation = toRecord(defaults.location);
	const rawTracking = toRecord(defaults.tracking);

	const eventType = normalizeEventType(cmdOpts.eventType ?? defaults.event_type);
	const startTime = normalizeStartTime(cmdOpts.startTime ?? defaults.start_time);
	const inviteeEmail = normalizeEmail(
		cmdOpts.inviteeEmail ?? defaults.invitee_email ?? rawInvitee.email,
		'invitee_email',
		'invitee_email is required (use --invitee-email or --raw {"invitee_email":"..."})'
	);
	const inviteeTimezone = normalizeTimezone(
		cmdOpts.inviteeTimezone ?? defaults.invitee_timezone ?? rawInvitee.timezone
	);
	const inviteeName = normalizeOptionalString(cmdOpts.inviteeName ?? defaults.invitee_name ?? rawInvitee.name, 'invitee_name');
	const inviteeFirstName = normalizeOptionalString(
		cmdOpts.inviteeFirstName ?? defaults.invitee_first_name ?? rawInvitee.first_name,
		'invitee_first_name'
	);
	const inviteeLastName = normalizeOptionalString(
		cmdOpts.inviteeLastName ?? defaults.invitee_last_name ?? rawInvitee.last_name,
		'invitee_last_name'
	);
	if (inviteeName && (inviteeFirstName || inviteeLastName)) {
		throw new Error('provide either invitee_name or invitee_first_name/invitee_last_name, not both');
	}

	const inviteePhone = normalizePhone(cmdOpts.inviteePhone ?? defaults.invitee_phone ?? rawInvitee.text_reminder_number);
	const locationKind = normalizeOptionalString(cmdOpts.locationKind ?? defaults.location_kind ?? rawLocation.kind, 'location_kind');
	const locationDetails = normalizeOptionalString(
		cmdOpts.locationDetails ?? defaults.location_details ?? rawLocation.location,
		'location_details'
	);
	if (locationDetails && !locationKind) {
		throw new Error('location_kind is required when location_details is provided');
	}

	const eventGuests = normalizeEventGuests(
		Array.isArray(cmdOpts.eventGuest) && cmdOpts.eventGuest.length > 0 ? cmdOpts.eventGuest : defaults.event_guests
	);
	const questionsInput =
		parseJsonOption(cmdOpts.questionsAndAnswers, 'questions_and_answers') ??
		parseJsonOption(cmdOpts.questions, 'questions') ??
		defaults.questions_and_answers ??
		defaults.questions;
	const questionsAndAnswers = normalizeQuestionsAndAnswers(questionsInput);
	const utmSource = normalizeOptionalString(cmdOpts.utmSource ?? defaults.utm_source ?? rawTracking.utm_source, 'utm_source');
	const utmCampaign = normalizeOptionalString(
		cmdOpts.utmCampaign ?? defaults.utm_campaign ?? rawTracking.utm_campaign,
		'utm_campaign'
	);
	const utmMedium = normalizeOptionalString(cmdOpts.utmMedium ?? defaults.utm_medium ?? rawTracking.utm_medium, 'utm_medium');

	return {
		event_type: eventType,
		start_time: startTime,
		invitee_email: inviteeEmail,
		invitee_timezone: inviteeTimezone,
		...(inviteeName ? { invitee_name: inviteeName } : {}),
		...(inviteeFirstName ? { invitee_first_name: inviteeFirstName } : {}),
		...(inviteeLastName ? { invitee_last_name: inviteeLastName } : {}),
		...(inviteePhone ? { invitee_phone: inviteePhone } : {}),
		...(locationKind ? { location_kind: locationKind } : {}),
		...(locationDetails ? { location_details: locationDetails } : {}),
		...(eventGuests && eventGuests.length > 0 ? { event_guests: eventGuests } : {}),
		...(questionsAndAnswers && questionsAndAnswers.length > 0 ? { questions_and_answers: questionsAndAnswers } : {}),
		...(utmSource ? { utm_source: utmSource } : {}),
		...(utmCampaign ? { utm_campaign: utmCampaign } : {}),
		...(utmMedium ? { utm_medium: utmMedium } : {}),
	};
}

export function toScheduleEventMcpArgs(query: ScheduleEventQuery): Record<string, unknown> {
	return {
		...query,
	};
}

export function toScheduleEventRestBody(query: ScheduleEventQuery): Record<string, unknown> {
	const invitee: Record<string, unknown> = {
		email: query.invitee_email,
		timezone: query.invitee_timezone,
	};
	if (query.invitee_name) {
		invitee.name = query.invitee_name;
	} else {
		if (query.invitee_first_name) invitee.first_name = query.invitee_first_name;
		if (query.invitee_last_name) invitee.last_name = query.invitee_last_name;
	}
	if (query.invitee_phone) {
		invitee.text_reminder_number = query.invitee_phone;
	}

	const payload: Record<string, unknown> = {
		event_type: query.event_type,
		start_time: query.start_time,
		invitee,
	};
	if (query.location_kind) {
		payload.location = {
			kind: query.location_kind,
			...(query.location_details ? { location: query.location_details } : {}),
		};
	}
	if (query.event_guests && query.event_guests.length > 0) {
		payload.event_guests = query.event_guests;
	}
	if (query.questions_and_answers && query.questions_and_answers.length > 0) {
		payload.questions_and_answers = query.questions_and_answers;
	}
	if (query.utm_source || query.utm_campaign || query.utm_medium) {
		payload.tracking = {
			utm_campaign: query.utm_campaign ?? null,
			utm_source: query.utm_source ?? null,
			utm_medium: query.utm_medium ?? null,
			utm_content: null,
			utm_term: null,
			salesforce_uuid: null,
		};
	}
	return payload;
}

export function shapeScheduleEventResult(
	result: unknown,
	query: ScheduleEventQuery
): Record<string, unknown> {
	const response = toRecord(result);
	const resource = response.resource && typeof response.resource === 'object'
		? toRecord(response.resource)
		: response;

	const eventUri = pickString(resource.event, toRecord(resource.event).uri);
	const inviteeUri = pickString(resource.uri);
	const eventUuid = parseUuidFromUri(eventUri, 'scheduled_events');
	const inviteeUuid = parseUuidFromUri(inviteeUri, 'invitees');

	const location = toRecord(resource.location);
	const eventLocation = toRecord(toRecord(resource.event).location);
	const meetingLink = pickString(
		location.join_url,
		location.location,
		eventLocation.join_url,
		eventLocation.location,
		resource.reschedule_url
	);

	const calendarEvent = toRecord(resource.calendar_event);
	const addToCalendarLinks: Record<string, string> = {};
	const google = pickString(calendarEvent.google, calendarEvent.google_calendar);
	const outlook = pickString(calendarEvent.outlook);
	const ics = pickString(calendarEvent.ics, calendarEvent.ical);
	if (google) addToCalendarLinks.google = google;
	if (outlook) addToCalendarLinks.outlook = outlook;
	if (ics) addToCalendarLinks.ics = ics;

	return {
		query: {
			event_type: query.event_type,
			start_time: query.start_time,
			invitee_email: query.invitee_email,
			invitee_timezone: query.invitee_timezone,
		},
		meta: {
			scheduled: Boolean(resource && Object.keys(resource).length > 0),
			calendar_invite_sent: typeof resource.status === 'string' ? resource.status === 'active' : undefined,
		},
		resource: {
			event_uri: eventUri ?? null,
			event_uuid: eventUuid ?? null,
			invitee_uri: inviteeUri ?? null,
			invitee_uuid: inviteeUuid ?? null,
			invitee_name: pickString(resource.name, query.invitee_name) ?? null,
			invitee_email: pickString(resource.email, query.invitee_email) ?? null,
			status: pickString(resource.status) ?? null,
			meeting_link: meetingLink ?? null,
			cancel_url: pickString(resource.cancel_url) ?? null,
			reschedule_url: pickString(resource.reschedule_url) ?? null,
			add_to_calendar_links: addToCalendarLinks,
		},
	};
}

export function toSafeScheduleEventError(error: unknown): string {
	const record = toRecord(error);
	const response = toRecord(record.response);
	const status = typeof response.status === 'number' ? response.status : undefined;
	const detail = extractErrorDetail(response.data ?? record);
	const detailLower = detail?.toLowerCase();

	if (status === 401) {
		return 'Authentication failed. Set a valid CALENDLY_API_KEY.';
	}
	if (status === 403) {
		return 'Scheduling API requires a paid Calendly plan (Standard or higher).';
	}
	if (status === 404) {
		return 'event_type was not found or is not accessible. Verify --event-type and your account permissions.';
	}
	if (status === 409 || (status === 422 && detailLower?.includes('available'))) {
		return 'The selected start_time is unavailable. Choose another slot from get-event-type-availability.';
	}
	if (status === 422 && detailLower?.includes('question')) {
		return 'Booking failed validation for custom questions. Verify --questions/--questions-and-answers matches event type requirements.';
	}
	if (status === 422) {
		return 'Booking request was rejected by Calendly. Verify invitee details and selected slot.';
	}
	if (status === 429) {
		return 'Calendly API rate limit reached. Retry shortly.';
	}
	if (detail) {
		return `Unable to schedule event: ${detail}`;
	}
	if (error instanceof Error && error.message.trim()) {
		return error.message;
	}
	return 'Unable to schedule event. Verify event type, slot availability, and invitee details.';
}
