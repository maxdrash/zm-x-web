import { h, Component } from 'preact';
import { Text, withText } from 'preact-i18n';
import linkstate from 'linkstate';
import moment from 'moment';
import get from 'lodash/get';
import isString from 'lodash/isString';
import { Button, Icon } from '@zimbra/blocks';

import { newAlarm, hasEmailAlarm, hasDisplayAlarm } from '../../utils/event';
import { getPrimaryAccountAddress } from '../../utils/account';

import ModalDialog from '../modal-dialog';
import FormGroup from '../form-group';
import TextInput from '../text-input';
import Textarea from '../textarea';
import DateInput from '../date-input';
import TimeInput from '../time-input';
import Select from '../select';
import AlignedForm from '../aligned-form';
import AlignedLabel from '../aligned-form/label';
import AddressField from '../address-field';
import AvailabilityIndicator from '../availability-indicator';
import chooseFiles from 'choose-files';
import AttachmentGrid from '../attachment-grid';
import wire from 'wiretie';

import s from './style.less';
import { ATTENDEE_ROLE } from '../../constants/calendars';

const REMIND_OPTIONS = [
	'never',
	'0m',
	'1m',
	'5m',
	'10m',
	'15m',
	'30m',
	'45m',
	'60m',
	'2h',
	'3h',
	'4h',
	'5h',
	'18h',
	'1d',
	'2d',
	'3d',
	'4d',
	'1w',
	'2w'
];

const INTERVAL_SHORTHAND_MAP = {
	m: 'minutes',
	h: 'hours',
	d: 'days',
	w: 'weeks'
};

const SHOW_AS_OPTIONS = ['F', 'T', 'B', 'O'];
const REPEAT_OPTIONS = ['NONE', 'DAI', 'WEE', 'MON', 'YEA'];

function remindValueFor(relativeTrigger) {
	return (
		(relativeTrigger.weeks && `${relativeTrigger.weeks}w`) ||
		(relativeTrigger.days && `${relativeTrigger.days}d`) ||
		(relativeTrigger.hours && `${relativeTrigger.hours}h`) ||
		(typeof relativeTrigger.minutes === 'number' &&
			`${relativeTrigger.minutes}m`)
	);
}
@wire('zimbra', {}, zimbra => ({
	attach: zimbra.appointments.attach
}))
@withText({
	errorMsg: 'calendar.editModal.FILE_SIZE_EXCEEDED'
})
export default class EditEventModal extends Component {
	static defaultProps = {
		title: 'calendar.editModal.title'
	};

	state = {
		event: null,
		remindValue: null,
		remindDesktop: true,
		remindEmail: false,
		repeatValue: 'NONE',
		showAsValue: 'B',
		allDay: false,
		isPrivate: false,
		isChoosingAttachments: false,
		notes: '',
		attendees: [],
		attachments: [],
		aidArr: [],
		isErrored: false
	};

	setEvent = props => {
		const alarms = props.event.alarms;
		const alarm = alarms ? alarms[0] : null;
		this.setState({
			event: props.event,
			remindValue: alarm && remindValueFor(alarm.trigger.relative),
			remindDesktop: hasDisplayAlarm(alarms),
			remindEmail: hasEmailAlarm(alarms),
			allDay: props.event.allDay,
			isPrivate: this.state.isPrivate
		});
	};

	alarmsFromState = () => {
		const { remindValue, remindDesktop, remindEmail } = this.state;
		const email =
			get(
				this,
				'props.preferencesData.preferences.zimbraPrefCalendarReminderEmail'
			) || getPrimaryAccountAddress(this.props.accountInfoData.accountInfo);
		if (remindValue === 'never') {
			return [];
		}

		const [, intervalValue, intervalType] = remindValue.match(/(\d*)([mhdw])/);
		const interval = {
			[INTERVAL_SHORTHAND_MAP[intervalType]]: parseInt(intervalValue, 10)
		};

		let alarms = [];
		if (remindDesktop) {
			alarms.push(newAlarm({ interval, action: 'DISPLAY' }));
		}
		if (remindEmail && email) {
			alarms.push(
				newAlarm({ interval, action: 'EMAIL', attendees: { email } })
			);
		}

		return alarms;
	};

	recurrenceFromState = () => {
		const { repeatValue } = this.state;
		if (repeatValue === 'NONE') {
			return undefined;
		}

		return {
			add: {
				rule: {
					interval: {
						intervalCount: 1
					},
					frequency: repeatValue
				}
			}
		};
	};

	handleSubmit = () => {
		const {
			showAsValue,
			allDay,
			event,
			attendees,
			notes,
			isPrivate,
			attachments
		} = this.state;

		const promiseArray = this.getAttachPromises(attachments);
		Promise.all(promiseArray)
			.then(res => {
				const aidArr = res;
				this.props.onAction({
					...event,
					allDay,
					attendees,
					isPrivate,
					attachments: aidArr,
					notes,
					alarms: this.alarmsFromState(),
					recurrence: this.recurrenceFromState(),
					freeBusy: showAsValue
				});
			})
			.catch(() => {
				this.setState({ isErrored: true });
			});
	};

	handleAttendeesChange = e => {
		const attendees = e.value.map(a => {
			if (isString(a)) {
				return a;
			}

			const attendee = this.state.attendees.find(
				({ address }) => a.address === address
			);
			return {
				role: attendee ? attendee.role : ATTENDEE_ROLE.required,
				...a
			};
		});

		const update = { attendees };

		if (this.state.availabilityVisible && !attendees.some(a => !isString(a))) {
			update.availabilityVisible = false;
		}

		this.setState(update);
	};

	handleToggleAvailabilty = () => {
		this.setState({
			availabilityVisible: !this.state.availabilityVisible
		});
	};

	handleStartChange = date => {
		const { event } = this.state;
		const diff = moment(event.start).diff(date);
		this.setState({
			event: {
				...event,
				start: date,
				end: moment(event.end)
					.subtract(diff)
					.toDate()
			}
		});
	};

	handleEndChange = date => {
		this.setState({
			event: {
				...this.state.event,
				end: date
			}
		});
	};

	chooseAttachments = () => {
		this.setState({ isChoosingAttachments: true });
		chooseFiles(this.addAttachments);
	};

	addAttachments = attachments => {
		this.setState({
			...this.state,
			isChoosingAttachments: false,
			isErrored: false,
			attachments: this.state.attachments.concat(attachments)
		});
	};

	getAttachPromises = attachments =>
		attachments &&
		attachments.map(attachment =>
			this.props.attach(attachment, {
				filename: attachment.name,
				contentType: attachment.type
			})
		);

	onClose = () => {
		if (!this.state.isChoosingAttachments) {
			this.props.onClose();
		}
	};

	removeAttachment = ({ attachment }) => {
		let { attachments } = this.state;
		this.setState({
			...this.state,
			isErrored: false,
			attachments: attachments.filter(a => a !== attachment)
		});
	};

	componentWillMount() {
		this.setEvent(this.props);
	}

	componentWillReceiveProps(nextProps) {
		this.setEvent(nextProps);
	}

	render(
		{ title, errorMsg },
		{
			allDay,
			isPrivate,
			attendees,
			event,
			notes,
			remindDesktop,
			remindEmail,
			remindValue,
			repeatValue,
			showAsValue,
			availabilityVisible,
			attachments,
			attachPending,
			isErrored
		}
	) {
		const start = moment(event.start);
		const endDate = allDay ? start.endOf('day') : event.end;
		const invalidDateRange = !allDay && start.diff(event.end) > 0;
		const showAvailabilityButtonVisible =
			!availabilityVisible && attendees.some(a => !isString(a));
		const error = isErrored ? errorMsg : '';
		return (
			<ModalDialog
				class={s.dialog}
				contentClass={s.dialogContent}
				title={title}
				actionLabel="buttons.ok"
				onAction={this.handleSubmit}
				onClose={this.onClose}
				disablePrimary={invalidDateRange || attachPending}
				error={error}
				disableOutsideClick
			>
				<AlignedForm>
					<FormGroup>
						<TextInput
							placeholder="New Event"
							value={event.name}
							onInput={linkstate(this, 'event.name')}
							wide
							autofocus
						/>
					</FormGroup>
					<FormGroup>
						<AlignedLabel>Start</AlignedLabel>
						<DateInput
							class={s.inlineField}
							dateValue={event.start}
							onDateChange={this.handleStartChange}
						/>
						<TimeInput
							class={s.inlineField}
							dateValue={
								allDay ? moment(event.start).startOf('day') : event.start
							}
							onDateChange={this.handleStartChange}
							disabled={allDay}
						/>
						<label>
							<input
								type="checkbox"
								checked={allDay}
								onChange={linkstate(this, 'allDay')}
							/>
							All Day
						</label>
					</FormGroup>
					<FormGroup>
						<AlignedLabel>End</AlignedLabel>
						<DateInput
							class={s.inlineField}
							dateValue={endDate}
							onDateChange={linkstate(this, 'event.end')}
							disabled={allDay}
							invalid={invalidDateRange}
						/>
						<TimeInput
							class={s.inlineField}
							dateValue={endDate}
							onDateChange={this.handleEndChange}
							disabled={allDay}
							invalid={invalidDateRange}
						/>
					</FormGroup>
					<FormGroup>
						<AlignedLabel>Repeat</AlignedLabel>
						<Select
							value={repeatValue}
							onChange={linkstate(this, 'repeatValue')}
						>
							{REPEAT_OPTIONS.map(k => (
								<option value={k} key={k}>
									<Text id={`calendar.editModal.fields.repeat.options.${k}`} />
								</option>
							))}
						</Select>
						<AlignedLabel>
							<label>
								<input
									type="checkbox"
									checked={isPrivate}
									onChange={linkstate(this, 'isPrivate')}
								/>
								Private
							</label>
						</AlignedLabel>
					</FormGroup>
					<FormGroup>
						<AlignedLabel>Location</AlignedLabel>
						<TextInput
							value={event.location}
							onInput={linkstate(this, 'event.location')}
							wide
						/>
					</FormGroup>
					<FormGroup class={s.inviteesGroup}>
						<AlignedLabel>Invitees</AlignedLabel>
						<AddressField
							class={s.addressField}
							value={attendees}
							onChange={this.handleAttendeesChange}
							formSize
						/>
					</FormGroup>
					<FormGroup
						class={availabilityVisible && s.availabilityIndicatorGroup}
					>
						{availabilityVisible ? (
							<AvailabilityIndicator
								event={event}
								attendees={attendees}
								onAttendeesChange={this.handleAttendeesChange}
								onStartChange={this.handleStartChange}
								onClose={this.handleToggleAvailabilty}
							/>
						) : (
							showAvailabilityButtonVisible && (
								<Button
									class={s.fieldOffset}
									onClick={this.handleToggleAvailabilty}
								>
									Show Availability
								</Button>
							)
						)}
					</FormGroup>
					<FormGroup>
						<AlignedLabel>Notes</AlignedLabel>
						<div class={s.notesContainer}>
							<Textarea
								class={s.textArea}
								rows="5"
								wide
								value={notes}
								onInput={linkstate(this, 'notes')}
							/>
							{attachments &&
								(attachments.length > 0 && (
									<div class={s.attachments}>
										<AttachmentGrid
											attachments={attachments}
											isEventAttachments
											removable
											onRemove={this.removeAttachment}
										/>
									</div>
								))}
						</div>
						<Button
							title="Add Attachment"
							class={s.attachmentButton}
							onClick={this.chooseAttachments}
						>
							<Icon size="md" name="paperclip" />
						</Button>
					</FormGroup>
					<FormGroup compact>
						<AlignedLabel>Remind</AlignedLabel>
						<Select
							value={remindValue}
							onChange={linkstate(this, 'remindValue')}
						>
							{REMIND_OPTIONS.map(k => (
								<option value={k} key={k}>
									<Text id={`calendar.editModal.fields.remind.options.${k}`} />
								</option>
							))}
						</Select>
					</FormGroup>
					{remindValue !== 'never' && (
						<FormGroup class={s.fieldOffset} rows>
							<label class={s.subOption}>
								<input
									type="checkbox"
									onChange={linkstate(this, 'remindDesktop')}
									checked={remindDesktop}
								/>
								Mobile/Desktop
							</label>
							<label class={s.subOption}>
								<input
									type="checkbox"
									onChange={linkstate(this, 'remindEmail')}
									checked={remindEmail}
								/>
								Email
							</label>
						</FormGroup>
					)}
					<FormGroup>
						<AlignedLabel>Show as</AlignedLabel>
						<Select
							value={showAsValue}
							onChange={linkstate(this, 'showAsValue')}
						>
							{SHOW_AS_OPTIONS.map(k => (
								<option value={k} key={k}>
									<Text id={`calendar.editModal.fields.showAs.options.${k}`} />
								</option>
							))}
						</Select>
					</FormGroup>
				</AlignedForm>
			</ModalDialog>
		);
	}
}
