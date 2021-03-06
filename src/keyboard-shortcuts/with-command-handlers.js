import { h, Component } from 'preact';

/**
 * A wrapper HOC that handles the adding and removing of shortcut command handlers.
 *
 * @param {object[]|function} shortcutHandlers an array of shortcut handler objects, or a function that takes in 'props' and returns an array of shortcut handler objects
 *
 * @example
 * @withCommandHandlers([
 * 	{ context: 'foo', command: 'TRIGGER_ONCLICK', handler: () => console.log('foo'); }
 * ])
 *
 *  @example
 * @withCommandHandlers((props) => [
 * 	{ context: 'foo', command: 'TRIGGER_ONCLICK', handler: props.onClick }
 * ])
 */
export default function withCommandHandlers(shortcutHandlers) {
	return BaseComponent => (
		class WithCommandHandlers extends Component {

			componentDidMount() {
				this.handlers = typeof shortcutHandlers === 'function' ? shortcutHandlers(this.props) : shortcutHandlers;
				this.context.shortcutCommandHandler.addCommandHandlers(this.handlers);
			}

			componentWillUnmount() {
				this.context.shortcutCommandHandler.removeCommandHandlers(this.handlers);
			}

			render() {
				return h(BaseComponent, this.props);
			}
		}
	);
}
