import "../../chunks/index-server.js";
import { I as attr, L as escape_html, i as ensure_array_like, n as attr_class, o as stringify } from "../../chunks/dev.js";
//#region src/routes/+page.svelte
function _page($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		let messages = [];
		let inputText = "";
		let isThinking = false;
		$$renderer.push(`<main class="chat-container"><header><h1>Gemma French Tutor</h1></header> <div class="messages">`);
		if (messages.length === 0) {
			$$renderer.push("<!--[0-->");
			$$renderer.push(`<div class="empty-state">Start speaking or typing in French!</div>`);
		} else $$renderer.push("<!--[-1-->");
		$$renderer.push(`<!--]--> <!--[-->`);
		const each_array = ensure_array_like(messages);
		for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
			let msg = each_array[$$index];
			$$renderer.push(`<div${attr_class(`message ${stringify(msg.role)}`)}><div class="bubble"><p>${escape_html(msg.text)}</p> `);
			if (msg.lesson) {
				$$renderer.push("<!--[0-->");
				$$renderer.push(`<div class="lesson"><strong>Lesson:</strong> ${escape_html(msg.lesson)}</div>`);
			} else $$renderer.push("<!--[-1-->");
			$$renderer.push(`<!--]--></div></div>`);
		}
		$$renderer.push(`<!--]--> `);
		$$renderer.push("<!--[-1-->");
		$$renderer.push(`<!--]--></div> <div class="input-area"><input type="text"${attr("value", inputText)} placeholder="Type a message in French..."/> <button${attr("disabled", isThinking, true)}>Send</button> `);
		$$renderer.push("<!--[-1-->");
		$$renderer.push(`<button class="record-btn"${attr("disabled", isThinking, true)}>🎤 Speak</button>`);
		$$renderer.push(`<!--]--></div></main>`);
	});
}
//#endregion
export { _page as default };
