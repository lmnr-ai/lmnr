import { type Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy - Laminar",
  description: "How Laminar collects, uses, and protects your data.",
};

export default function PrivacyPage() {
  return (
    <div className="max-w-4xl mx-auto p-6 space-y-4">
      <div>
        <div><strong>
          <h1>PRIVACY POLICY</h1>
        </strong></div>
        <div><span><strong>Last updated August 19, 2025</strong></span></div>
        <div><span>This Privacy Notice for LMNR AI, Inc. (doing business as Laminar) ("<strong>we</strong>," "<strong>us</strong>," or "<strong>our</strong>" </span><span>), describes how and why we might access, collect, store, use, and/or share ("<strong>process</strong>") your personal information when you use our services ( "<strong>Services</strong>" ), including when you: </span></div>
        <ul>
          <li><span>Visit our website at <a href="https://laminar.sh" target="_blank">https://laminar.sh</a>
            <span> or any website of ours that links to this Privacy Notice </span></span></li>
        </ul>
        <div>
          <ul>
            <li><span>Use Laminar. Open-source AI engineering platform offering observability, evaluations, and advanced data management</span>
            </li>
          </ul>
          <ul>
            <li><span>Engage with us in other related ways, including any sales, marketing, or events</span></li>
          </ul>
          <div><span><strong>Questions or concerns? </strong>Reading this Privacy Notice will help you understand your privacy rights and choices. We are responsible for making decisions about how your personal information is processed. If you do not agree with our policies and practices, please do not use our Services. If you still have any questions or concerns, please contact us at founders@lmnr.ai.</span></div>
          <div><strong>
            <h2>SUMMARY OF KEY POINTS</h2>
          </strong></div>
          <div><span><strong><em>This summary provides key points from our Privacy Notice, but you can find out more details about any of these topics by clicking the link following each key point or by using our </em></strong></span><a href="#toc"><span><span><strong><em>table of contents</em></strong></span></span></a><span><span><strong><em> below to find the section you are looking for.</em></strong></span></span></div>
          <div><span><strong>What personal information do we process?</strong> When you visit, use, or navigate our Services, we may process personal information depending on how you interact with us and the Services, the choices you make, and the products and features you use. Learn more about </span><a href="#personalinfo"><span>personal information you disclose to us</span></a><span>.</span>
          </div>
          <div><span><strong>Do we process any sensitive personal information? </strong>Some of the information may be considered "special" or "sensitive" in certain jurisdictions, for example your racial or ethnic origins, sexual orientation, and religious beliefs. We do not process sensitive personal information. </span></div>
          <div><span><strong>Do we collect any information from third parties?</strong> We do not collect any information from third parties. </span></div>
          <div><span><strong>How do we process your information?</strong> We process your information to provide, improve, and administer our Services, communicate with you, for security and fraud prevention, and to comply with law. We may also process your information for other purposes with your consent. We process your information only when we have a valid legal reason to do so. Learn more about </span><a href="#infouse"><span>how we process your information</span></a><span>.</span></div>
          <div><span><strong>In what situations and with which parties do we share personal information?</strong> We may share information in specific situations and with specific third parties. Learn more about </span><a href="#whoshare"><span>when and with whom we share your personal information</span></a><span>.</span></div>
          <div><span><strong>How do we keep your information safe?</strong> We have adequate organizational and technical processes and procedures in place to protect your personal information. However, no electronic transmission over the internet or information storage technology can be guaranteed to be 100% secure, so we cannot promise or guarantee that hackers, cybercriminals, or other unauthorized third parties will not be able to defeat our security and improperly collect, access, steal, or modify your information. Learn more about </span><a href="#infosafe"><span>how we keep your information safe</span></a><span>.</span></div>
          <div><span><strong>What are your rights?</strong> Depending on where you are located geographically, the applicable privacy law may mean you have certain rights regarding your personal information. Learn more about </span><a href="#privacyrights"><span>your privacy rights</span></a><span>.</span></div>
          <div><span><strong>How do you exercise your rights?</strong> The easiest way to exercise your rights is by visiting <a href="https://laminar.sh" target="_blank">https://laminar.sh</a> , or by contacting us. We will consider and act upon any request in accordance with applicable data protection laws. </span></div>
          <div><span>Want to learn more about what we do with any information we collect? </span><a href="#toc"><span>Review the Privacy Notice in full</span></a><span>.</span></div>
          <div id="toc"><span><strong>
            <h2>TABLE OF CONTENTS</h2>
          </strong>
          </span></div>
          <div><span><a href="#infocollect"><span>1. WHAT INFORMATION DO WE COLLECT?</span></a></span></div>
          <div><span><a href="#infouse"><span>2. HOW DO WE PROCESS YOUR INFORMATION? </span></a></span></div>
          <div><span><a href="#legalbases"><span>3. <span>WHAT LEGAL BASES DO WE RELY ON TO PROCESS YOUR PERSONAL INFORMATION?</span>
          </span></a></span></div>
          <a href="#whoshare">4. WHEN AND WITH WHOM DO WE SHARE YOUR PERSONAL INFORMATION?</a>
          <div><span><a href="#cookies"><span>5. DO WE USE COOKIES AND OTHER TRACKING TECHNOLOGIES?</span></a>
          </span></div>
          <div><a href="#ai"><span>6. DO WE OFFER ARTIFICIAL INTELLIGENCE-BASED PRODUCTS?</span></a></div>
          <div><span><a href="#sociallogins"><span>7. HOW DO WE HANDLE YOUR SOCIAL LOGINS?</span></a></span></div>
          <div><span><a href="#inforetain"><span>8. HOW LONG DO WE KEEP YOUR INFORMATION?</span></a></span></div>
          <div><span><a href="#infosafe"><span>9. HOW DO WE KEEP YOUR INFORMATION SAFE?</span></a></span></div>
          <div><span><a href="#infominors"><span>10. DO WE COLLECT INFORMATION FROM MINORS?</span></a></span></div>
          <a href="#privacyrights">11. WHAT ARE YOUR PRIVACY RIGHTS?</a>
          <div><span><a href="#DNT"><span>12. CONTROLS FOR DO-NOT-TRACK FEATURES </span></a></span></div>
          <div><span><a href="#uslaws"><span>13. DO UNITED STATES RESIDENTS HAVE SPECIFIC PRIVACY RIGHTS?</span></a></span>
          </div>
          <div><span><a href="#policyupdates"><span>14. DO WE MAKE UPDATES TO THIS NOTICE?</span></a></span></div>
          <div><a href="#contact"><span>15. HOW CAN YOU CONTACT US ABOUT THIS NOTICE?</span></a></div>
          <div><a href="#request"><span>16. HOW CAN YOU REVIEW, UPDATE, OR DELETE THE DATA WE COLLECT FROM YOU?</span></a></div>
          <div id="infocollect"><span><strong>
            <h2>1. WHAT INFORMATION DO WE COLLECT?</h2>
          </strong></span><span id="personalinfo"><span><strong>
            <h3>Personal information you disclose to us</h3>
          </strong></span></span><span><span><strong><em>In Short:</em></strong></span><strong></strong><em>We collect personal information that you provide to us.</em></span></div>
          <span>We collect personal information that you voluntarily provide to us when you register on the Services, </span><span>express an interest in obtaining information about us or our products and Services, when you participate in activities on the Services, or otherwise when you contact us.</span>
          <div><span><strong>Personal Information Provided by You.</strong> The personal information that we collect depends on the context of your interactions with us and the Services, the choices you make, and the products and features you use. The personal information we collect may include the following:</span></div>
          <ul>
            <li><span> email addresses </span></li>
          </ul>
          <ul>
            <li><span> usernames </span></li>
          </ul>
          <div id="sensitiveinfo"><span><span><strong>Sensitive Information.</strong> We do not process sensitive information. </span></span></div>
          <div><span><strong>Payment Data.</strong> We may collect data necessary to process your payment if you choose to make purchases, such as your payment instrument number, and the security code associated with your payment instrument. All payment data is handled and stored by Stripe<span>. You may find their privacy notice link(s) here: <a href="https://stripe.com/privacy" target="_blank">https://stripe.com/privacy</a>
            <span>.</span>
          </span></span></div>
          <div><span><strong>Social Media Login Data. </strong>We may provide you with the option to register with us using your existing social media account details, like your Facebook, X, or other social media account. If you choose to register in this way, we will collect certain profile information about you from the social media provider, as described in the section called "<a href="#sociallogins">HOW DO WE HANDLE YOUR SOCIAL LOGINS?</a> " below. </span></div>
          <span>All personal information that you provide to us must be true, complete, and accurate, and you must notify us of any changes to such personal information.</span>
          <div><span><span><strong>
            <h3>Information automatically collected</h3>
          </strong></span></span><span><span><strong><em>In Short:</em></strong></span><strong></strong><em>Some information — such as your Internet Protocol (IP) address and/or browser and device characteristics — is collected automatically when you visit our Services.</em></span></div>
          <span>We automatically collect certain information when you visit, use, or navigate the Services. This information does not reveal your specific identity (like your name or contact information) but may include device and usage information, such as your IP address, browser and device characteristics, operating system, language preferences, referring URLs, device name, country, location, information about how and when you use our Services, and other technical information. This information is primarily needed to maintain the security and operation of our Services, and for our internal analytics and reporting purposes.</span>
          <div><span>Like many businesses, we also collect information through cookies and similar technologies. You can find out more about this in our Cookie Notice: <a href="https://laminar.sh/policies/cookies" target="_blank">https://laminar.sh/policies/cookies</a> . </span></div>
          <span>The information we collect includes:</span>
          <ul>
            <li><span><em>Log and Usage Data.</em> Log and usage data is service-related, diagnostic, usage, and performance information our servers automatically collect when you access or use our Services and which we record in log files. Depending on how you interact with us, this log data may include your IP address, device information, browser type, and settings and information about your activity in the Services(such as the date/time stamps associated with your usage, pages and files viewed, searches, and other actions you take such as which features you use), device event information (such as system activity, error reports (sometimes called "crash dumps"), and hardware settings).</span></li>
          </ul>
          <ul>
            <li><span><em>Device Data.</em> We collect device data such as information about your computer, phone, tablet, or other device you use to access the Services. Depending on the device used, this device data may include information such as your IP address (or proxy server), device and application identification numbers, location, browser type, hardware model, Internet service provider and/or mobile carrier, operating system, and system configuration information.</span></li>
          </ul>
          <ul>
            <li><span><em>Location Data.</em> We collect location data such as information about your device's location, which can be either precise or imprecise. How much information we collect depends on the type and settings of the device you use to access the Services. For example, we may use GPS and other technologies to collect geolocation data that tells us your current location (based on your IP address). You can opt out of allowing us to collect this information either by refusing access to the information or by disabling your Location setting on your device. However, if you choose to opt out, you may not be able to use certain aspects of the Services.</span></li>
          </ul>
          <div id="infouse"><span><strong>
            <h2>2. HOW DO WE PROCESS YOUR INFORMATION?</h2>
          </strong></span><span><strong><em>In Short: </em></strong><em>We process your information to provide, improve, and administer our Services, communicate with you, for security and fraud prevention, and to comply with law. We process the personal information for the following purposes listed below. We may also process your information for other purposes only with your prior explicit consent.</em></span></div>
          <strong>We process your personal information for a variety of reasons, depending on how you interact with our Services, including:</strong>
          <ul>
            <li><span><strong>To facilitate account creation and authentication and otherwise manage user accounts. </strong>We may process your information so you can create and log in to your account, as well as keep your account in working order.</span>
            </li>
          </ul>
          <ul>
            <li><span><strong>To deliver and facilitate delivery of services to the user. </strong>We may process your information to provide you with the requested service.</span>
            </li>
          </ul>
          <ul>
            <li><span><strong>To respond to user inquiries/offer support to users. </strong>We may process your information to respond to your inquiries and solve any potential issues you might have with the requested service.</span></li>
          </ul>
          <ul>
            <li><span><strong>To send administrative information to you. </strong>We may process your information to send you details about our products and services, changes to our terms and policies, and other similar information.</span>
            </li>
          </ul>
          <ul>
            <li><span><strong>To request feedback. </strong>We may process your information when necessary to request feedback and to contact you about your use of our Services.</span>
            </li>
          </ul>
          <ul>
            <li><span><strong>To send you marketing and promotional communications. </strong>We may process the personal information you send to us for our marketing purposes, if this is in accordance with your marketing preferences. You can opt out of our marketing emails at any time. For more information, see " </span><a href="#privacyrights"><span>WHAT ARE YOUR PRIVACY RIGHTS?</span></a><span> " below. </span></li>
          </ul>
          <ul>
            <li><span><span><strong>To protect our Services.</strong> We may process your information as part of our efforts to keep our Services safe and secure, including fraud monitoring and prevention.</span></span>
            </li>
          </ul>
          <ul>
            <li><span><span><strong>To identify usage trends.</strong> We may process information about how you use our Services to better understand how they are being used so we can improve them.</span></span>
            </li>
          </ul>
          <ul>
            <li><span><span><strong>To save or protect an individual's vital interest.</strong> We may process your information when necessary to save or protect an individual’s vital interest, such as to prevent harm.</span></span>
            </li>
          </ul>
          <div id="legalbases">
            <strong>
              <h2>3. WHAT LEGAL BASES DO WE RELY ON TO PROCESS YOUR INFORMATION?</h2>
            </strong><em><span><span><strong>In Short: </strong>We only process your personal information when we believe it is necessary and we have a valid legal reason (i.e. , legal basis) to do so under applicable law, like with your consent, to comply with laws, to provide you with services to enter into or fulfill our contractual obligations, to protect your rights, or to fulfill our legitimate business interests.</span></span></em>
          </div>
          <div><em><span><span><strong><u>If you are located in the EU or UK, this section applies to you.</u></strong></span></span></em>
          </div>
          <span>The General Data Protection Regulation (GDPR) and UK GDPR require us to explain the valid legal bases we rely on in order to process your personal information. As such, we may rely on the following legal bases to process your personal information:</span>
          <ul>
            <li><span><span><strong>Consent. </strong>We may process your information if you have given us permission (i.e. , consent) to use your personal information for a specific purpose. You can withdraw your consent at any time. Learn more about </span></span><a href="#withdrawconsent"><span>withdrawing your consent</span></a><span>.</span>
            </li>
          </ul>
          <ul>
            <li><span><span><strong>Performance of a Contract.</strong> We may process your personal information when we believe it is necessary to fulfill our contractual obligations to you, including providing our Services or at your request prior to entering into a contract with you.</span></span>
            </li>
          </ul>
          <ul>
            <li><span><span><strong>Legitimate Interests.</strong> We may process your information when we believe it is reasonably necessary to achieve our legitimate business interests and those interests do not outweigh your interests and fundamental rights and freedoms. For example, we may process your personal information for some of the purposes described in order to:</span></span></li>
          </ul>
          <ul>
            <li><span>Send users information about special offers and discounts on our products and services </span></li>
          </ul>
          <ul>
            <li><span> Analyze how our Services are used so we can improve them to engage and retain users </span></li>
          </ul>
          <ul>
            <li><span>Diagnose problems and/or prevent fraudulent activities </span>
            </li>
          </ul>
          <ul>
            <li><span>Understand how our users use our products and services so we can improve user experience </span>
            </li>
          </ul>
          <ul>
            <li><span><span><strong>Legal Obligations.</strong> We may process your information where we believe it is necessary for compliance with our legal obligations, such as to cooperate with a law enforcement body or regulatory agency, exercise or defend our legal rights, or disclose your information as evidence in litigation in which we are involved. <br /></span></span>
            </li>
          </ul>
          <ul>
            <li><span><span><strong>Vital Interests.</strong> We may process your information where we believe it is necessary to protect your vital interests or the vital interests of a third party, such as situations involving potential threats to the safety of any person.</span></span>
            </li>
          </ul>
          <div><span><span><strong><u><em>If you are located in Canada, this section applies to you.</em></u></strong></span></span>
          </div>
          <div><span>We may process your information if you have given us specific permission (i.e. , express consent) to use your personal information for a specific purpose, or in situations where your permission can be inferred (i.e. , implied consent). You can </span><a href="#withdrawconsent"><span>withdraw your consent</span></a><span> at any time.</span>
          </div>
          <span>In some exceptional cases, we may be legally permitted under applicable law to process your information without your consent, including, for example:</span>
          <ul>
            <li><span>If collection is clearly in the interests of an individual and consent cannot be obtained in a timely way</span>
            </li>
          </ul>
          <ul>
            <li><span>For investigations and fraud detection and prevention </span>
            </li>
          </ul>
          <ul>
            <li><span>For business transactions provided certain conditions are met</span>
            </li>
          </ul>
          <ul>
            <li><span>If it is contained in a witness statement and the collection is necessary to assess, process, or settle an insurance claim</span>
            </li>
          </ul>
          <ul>
            <li><span>For identifying injured, ill, or deceased persons and communicating with next of kin</span>
            </li>
          </ul>
          <ul>
            <li><span>If we have reasonable grounds to believe an individual has been, is, or may be victim of financial abuse </span>
            </li>
          </ul>
          <ul>
            <li><span>If it is reasonable to expect collection and use with consent would compromise the availability or the accuracy of the information and the collection is reasonable for purposes related to investigating a breach of an agreement or a contravention of the laws of Canada or a province </span>
            </li>
          </ul>
          <ul>
            <li><span>If disclosure is required to comply with a subpoena, warrant, court order, or rules of the court relating to the production of records </span>
            </li>
          </ul>
          <ul>
            <li><span>If it was produced by an individual in the course of their employment, business, or profession and the collection is consistent with the purposes for which the information was produced </span>
            </li>
          </ul>
          <ul>
            <li><span>If the collection is solely for journalistic, artistic, or literary purposes </span>
            </li>
          </ul>
          <ul>
            <li><span>If the information is publicly available and is specified by the regulations</span>
            </li>
          </ul>
          <ul>
            <li><span>We may disclose de-identified information for approved research or statistics projects, subject to ethics oversight and confidentiality commitments</span></li>
          </ul>
          <div id="whoshare"><span><strong>
            <h2>4. WHEN AND WITH WHOM DO WE SHARE YOUR PERSONAL INFORMATION? </h2>
          </strong></span><span><strong><em>In Short:</em></strong><em> We may share information in specific situations described in this section and/or with the following third parties.</em></span>
          </div>
          <span>We may need to share your personal information in the following situations: </span>
          <ul>
            <li><span><span><strong>Business Transfers.</strong> We may share or transfer your information in connection with, or during negotiations of, any merger, sale of company assets, financing, or acquisition of all or a portion of our business to another company.</span></span>
            </li>
          </ul>
          <div id="cookies">
            <span><strong>
              <h2>5. DO WE USE COOKIES AND OTHER TRACKING TECHNOLOGIES? </h2>
            </strong><strong><em>In Short:</em></strong><em> We may use cookies and other tracking technologies to collect and store your information.</em></span>
          </div>
          <span>We may use cookies and similar tracking technologies (like web beacons and pixels) to gather information when you interact with our Services. Some online tracking technologies help us maintain the security of our Services and your account , prevent crashes, fix bugs, save your preferences, and assist with basic site functions. </span>
          <span>We also permit third parties and service providers to use online tracking technologies on our Services for analytics and advertising, including to help manage and display advertisements, to tailor advertisements to your interests, or to send abandoned shopping cart reminders (depending on your communication preferences). The third parties and service providers use their technology to provide advertising about products and services tailored to your interests which may appear either on our Services or on other websites.</span>
          <div>
            <span>To the extent these online tracking technologies are deemed to be a "sale"/"sharing" (which includes targeted advertising, as defined under the applicable laws) under applicable US state laws, you can opt out of these online tracking technologies by submitting a request as described below under section " </span><span><a href="#uslaws"><span>DO UNITED STATES RESIDENTS HAVE SPECIFIC PRIVACY RIGHTS?</span></a></span><span> " </span>
          </div>
          <div>
            <span>Specific information about how we use such technologies and how you can refuse certain cookies is set out in our Cookie Notice: <a href="https://laminar.sh/policies/cookies" target="_blank">https://laminar.sh/policies/cookies</a>
              <span> . </span></span>
          </div>
          <div id="ai">
            <span><strong>
              <h2>6. DO WE OFFER ARTIFICIAL INTELLIGENCE-BASED PRODUCTS? </h2>
            </strong><strong><em><span>In Short:</span></em></strong><em><span> We offer products, features, or tools powered by artificial intelligence, machine learning, or similar technologies.</span></em></span>
          </div>
          <span>As part of our Services, we offer products, features, or tools powered by artificial intelligence, machine learning, or similar technologies (collectively, " AI Products " ). These tools are designed to enhance your experience and provide you with innovative solutions. The terms in this Privacy Notice govern your use of the AI Products within our Services. </span>
          <div>
            <span><strong><span>Use of AI Technologies</span></strong></span>
          </div>
          <div>
            <span>We provide the AI Products through third-party service providers ( " AI Service Providers " ), including OpenAI , Anthropic and Google Cloud AI . As outlined in this Privacy Notice, your input, output, and personal information will be shared with and processed by these AI Service Providers to enable your use of our AI Products for purposes outlined in " </span><span><a href="#legalbases"><span>WHAT LEGAL BASES DO WE RELY ON TO PROCESS YOUR PERSONAL INFORMATION?</span></a><span> " You must not use the AI Products in any way that violates the terms or policies of any AI Service Provider. </span>
            </span>
          </div>
          <div>
            <span><strong><span>Our AI Products</span></strong></span>
          </div>
          <span>Our AI Products are designed for the following functions:</span>
          <ul>
            <li>
              <span>AI predictive analytics</span>
            </li>
          </ul>
          <ul>
            <li>
              <span>Text analysis</span>
            </li>
          </ul>
          <div>
            <span><strong><span>How We Process Your Data Using AI</span></strong></span>
          </div>
          <span>All personal information processed using our AI Products is handled in line with our Privacy Notice and our agreement with third parties. This ensures high security and safeguards your personal information throughout the process, giving you peace of mind about your data's safety.</span>
          <div>
            <span><strong><span>How to Opt Out</span></strong></span>
          </div>
          <span>We believe in giving you the power to decide how your data is used. To opt out, you can:</span>
          <ul>
            <li>
              <span>Contact us using the contact information provided</span>
            </li>
          </ul>
          <ul>
            <li>
              <span>Log in to your account settings and update your user account</span>
            </li>
          </ul>
          <div id="sociallogins">
            <span><span><strong>
              <h2>7. HOW DO WE HANDLE YOUR SOCIAL LOGINS? </h2>
            </strong></span></span><span><strong><em>In Short: </em></strong><em>If you choose to register or log in to our Services using a social media account, we may have access to certain information about you.</em></span>
          </div>
          <span>Our Services offer you the ability to register and log in using your third-party social media account details (like your Facebook or X logins). Where you choose to do this, we will receive certain profile information about you from your social media provider. The profile information we receive may vary depending on the social media provider concerned, but will often include your name, email address, friends list, and profile picture, as well as other information you choose to make public on such a social media platform.</span>
          <span>We will use the information we receive only for the purposes that are described in this Privacy Notice or that are otherwise made clear to you on the relevant Services. Please note that we do not control, and are not responsible for, other uses of your personal information by your third-party social media provider. We recommend that you review their privacy notice to understand how they collect, use, and share your personal information, and how you can set your privacy preferences on their sites and apps.</span>
          <div id="inforetain">
            <span><strong>
              <h2>8. HOW LONG DO WE KEEP YOUR INFORMATION? </h2>
            </strong></span><span><strong><em>In Short: </em></strong><em>We keep your information for as long as necessary to fulfill the purposes outlined in this Privacy Notice unless otherwise required by law. </em></span>
          </div>
          <span>We will only keep your personal information for as long as it is necessary for the purposes set out in this Privacy Notice, unless a longer retention period is required or permitted by law (such as tax, accounting, or other legal requirements). No purpose in this notice will require us keeping your personal information for longer than the period of time in which users have an account with us . </span>
          <span>When we have no ongoing legitimate business need to process your personal information, we will either delete or anonymize such information, or, if this is not possible (for example, because your personal information has been stored in backup archives), then we will securely store your personal information and isolate it from any further processing until deletion is possible. </span>
          <div id="infosafe">
            <span><strong>
              <h2>9. HOW DO WE KEEP YOUR INFORMATION SAFE? </h2>
            </strong></span><span><strong><em>In Short: </em></strong><em>We aim to protect your personal information through a system of organizational and technical security measures. </em></span>
          </div>
          <span>We have implemented appropriate and reasonable technical and organizational security measures designed to protect the security of any personal information we process. However, despite our safeguards and efforts to secure your information, no electronic transmission over the Internet or information storage technology can be guaranteed to be 100% secure, so we cannot promise or guarantee that hackers, cybercriminals, or other unauthorized third parties will not be able to defeat our security and improperly collect, access, steal, or modify your information. Although we will do our best to protect your personal information, transmission of personal information to and from our Services is at your own risk. You should only access the Services within a secure environment. </span>
          <div id="infominors">
            <span><strong>
              <h2>10. DO WE COLLECT INFORMATION FROM MINORS? </h2>
            </strong></span><span><strong><em>In Short:</em></strong><em> We do not knowingly collect data from or market to children under 18 years of age or the equivalent age as specified by law in your jurisdiction . </em>
            </span>
          </div>
          <div>
            <span>We do not knowingly collect, solicit data from, or market to children under 18 years of age or the equivalent age as specified by law in your jurisdiction , nor do we knowingly sell such personal information. By using the Services, you represent that you are at least 18 or the equivalent age as specified by law in your jurisdiction or that you are the parent or guardian of such a minor and consent to such minor dependent’s use of the Services. If we learn that personal information from users less than 18 years of age or the equivalent age as specified by law in your jurisdiction has been collected, we will deactivate the account and take reasonable measures to promptly delete such data from our records. If you become aware of any data we may have collected from children under age 18 or the equivalent age as specified by law in your jurisdiction , please contact us at <span> robert@lmnr.ai </span>. </span>
          </div>
          <div id="privacyrights">
            <span><strong>
              <h2>11. WHAT ARE YOUR PRIVACY RIGHTS? </h2>
            </strong></span><span><strong><em>In Short:</em></strong><em> Depending on your state of residence in the US or in some regions, such as the European Economic Area (EEA), United Kingdom (UK), Switzerland, and Canada , you have rights that allow you greater access to and control over your personal information.You may review, change, or terminate your account at any time, depending on your country, province, or state of residence. </em></span>
          </div>
          <div>
            <span>In some regions (like the EEA, UK, Switzerland, and Canada ), you have certain rights under applicable data protection laws. These may include the right (i) to request access and obtain a copy of your personal information, (ii) to request rectification or erasure; (iii) to restrict the processing of your personal information; (iv) if applicable, to data portability; and (v) not to be subject to automated decision-making. If a decision that produces legal or similarly significant effects is made solely by automated means, we will inform you, explain the main factors, and offer a simple way to request human review. In certain circumstances, you may also have the right to object to the processing of your personal information. You can make such a request by contacting us by using the contact details provided in the section " </span><a href="#contact"><span>HOW CAN YOU CONTACT US ABOUT THIS NOTICE?</span></a><span> " below. </span>
          </div>
          <span>We will consider and act upon any request in accordance with applicable data protection laws. </span>
          <div>
            <span>If you are located in the EEA or UK and you believe we are unlawfully processing your personal information, you also have the right to complain to your <span><a href="https://ec.europa.eu/justice/data-protection/bodies/authorities/index_en.htm" target="_blank"><span>Member State data protection authority</span></a></span> or </span><a href="https://ico.org.uk/make-a-complaint/data-protection-complaints/data-protection-complaints/" target="_blank"><span>UK data protection authority</span></a><span>.</span>
          </div>
          <div>
            <span>If you are located in Switzerland, you may contact the <a href="https://www.edoeb.admin.ch/edoeb/en/home.html" target="_blank">Federal Data Protection and Information Commissioner</a>.</span>
          </div>
          <div id="withdrawconsent">
            <span><strong><u>Withdrawing your consent:</u></strong> If we are relying on your consent to process your personal information, which may be express and/or implied consent depending on the applicable law, you have the right to withdraw your consent at any time. You can withdraw your consent at any time by contacting us by using the contact details provided in the section " </span><a href="#contact"><span>HOW CAN YOU CONTACT US ABOUT THIS NOTICE?</span></a><span> " below . </span>
          </div>
          <span>However, please note that this will not affect the lawfulness of the processing before its withdrawal nor, when applicable law allows, will it affect the processing of your personal information conducted in reliance on lawful processing grounds other than consent. </span>
          <div>
            <span><span><strong><u>Opting out of marketing and promotional communications:</u></strong>You can unsubscribe from our marketing and promotional communications at any time by clicking on the unsubscribe link in the emails that we send, or by contacting us using the details provided in the section " </span></span><a href="#contact"><span>HOW CAN YOU CONTACT US ABOUT THIS NOTICE?</span></a><span> " below. You will then be removed from the marketing lists. However, we may still communicate with you — for example, to send you service-related messages that are necessary for the administration and use of your account, to respond to service requests, or for other non-marketing purposes. </span>
            <span><strong>
              <h3>Account Information </h3>
            </strong></span><span>If you would at any time like to review or change the information in your account or terminate your account, you can: </span>
          </div>
          <ul>
            <li>
              <span> Contact us using the contact information provided. </span>
            </li>
          </ul>
          <span>Upon your request to terminate your account, we will deactivate or delete your account and information from our active databases. However, we may retain some information in our files to prevent fraud, troubleshoot problems, assist with any investigations, enforce our legal terms and/or comply with applicable legal requirements.</span>
          <div>
            <span><strong><u>Cookies and similar technologies:</u></strong> Most Web browsers are set to accept cookies by default. If you prefer, you can usually choose to set your browser to remove cookies and to reject cookies. If you choose to remove cookies or reject cookies, this could affect certain features or services of our Services. For further information, please see our Cookie Notice: <span><span><span>
              <a href="https://laminar.sh/policies/cookies" target="_blank">https://laminar.sh/policies/cookies</a> . </span>
            </span></span></span>
          </div>
          <span>If you have questions or comments about your privacy rights, you may email us at founders@lmnr.ai .</span>
          <div id="DNT">
            <span><strong>
              <h2>12. CONTROLS FOR DO-NOT-TRACK FEATURES </h2>
            </strong></span><span>Most web browsers and some mobile operating systems and mobile applications include a Do-Not-Track ( "DNT" ) feature or setting you can activate to signal your privacy preference not to have data about your online browsing activities monitored and collected. At this stage, no uniform technology standard for recognizing and implementing DNT signals has been finalized . As such, we do not currently respond to DNT browser signals or any other mechanism that automatically communicates your choice not to be tracked online. If a standard for online tracking is adopted that we must follow in the future, we will inform you about that practice in a revised version of this Privacy Notice. </span>
          </div>
          <span>California law requires us to let you know how we respond to web browser DNT signals. Because there currently is not an industry or legal standard for recognizing or honoring DNT signals, we do not respond to them at this time. </span>
          <div id="uslaws">
            <span><strong>
              <h2>13. DO UNITED STATES RESIDENTS HAVE SPECIFIC PRIVACY RIGHTS? </h2>
            </strong></span><span><strong><em>In Short: </em></strong><em>If you are a resident of California or Delaware , you may have the right to request access to and receive details about the personal information we maintain about you and how we have processed it, correct inaccuracies, get a copy of, or delete your personal information. You may also have the right to withdraw your consent to our processing of your personal information. These rights may be limited in some circumstances by applicable law. More information is provided below. </em></span><strong>
              <h3>Categories of Personal Information We Collect </h3>
            </strong><span>The table below shows the categories of personal information we have collected in the past twelve (12) months. The table includes illustrative examples of each category and does not reflect the personal information we collect from you. For a comprehensive inventory of all personal information we process, please refer to the section " </span><a href="#infocollect"><span>WHAT INFORMATION DO WE COLLECT?</span></a><span> " </span>
          </div>
          <table>
            <thead>
              <tr>
                <th>
                  <strong>Category</strong>
                </th>
                <th>
                  <strong>Examples</strong>
                </th>
                <th>
                  <strong>Collected</strong>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <span>A. Identifiers</span>
                </td>
                <td>
                  <span>Contact details, such as real name, alias, postal address, telephone or mobile contact number, unique personal identifier, online identifier, Internet Protocol address, email address, and account name</span>
                </td>
                <td>
                  <span> YES </span>
                </td>
              </tr>
            </tbody>
          </table>
          <table>
            <tbody>
              <tr>
                <td>
                  <span>B. Personal information as defined in the California Customer Records statute</span>
                </td>
                <td>
                  <span>Name, contact information, education, employment, employment history, and financial information</span>
                </td>
                <td>
                  <span> NO </span>
                </td>
              </tr>
            </tbody>
          </table>
          <table>
            <tbody>
              <tr>
                <td>
                  <span> C . Protected classification characteristics under state or federal law </span>
                </td>
                <td>
                  <span>Gender, age, date of birth, race and ethnicity, national origin, marital status, and other demographic data</span>
                </td>
                <td>
                  <span> NO </span>
                </td>
              </tr>
              <tr>
                <td>
                  <span> D . Commercial information </span>
                </td>
                <td>
                  <span>Transaction information, purchase history, financial details, and payment information</span>
                </td>
                <td>
                  <span> YES </span>
                </td>
              </tr>
              <tr>
                <td>
                  <span> E . Biometric information </span>
                </td>
                <td>
                  <span>Fingerprints and voiceprints</span>
                </td>
                <td>
                  <span> NO </span>
                </td>
              </tr>
              <tr>
                <td>
                  <span> F . Internet or other similar network activity </span>
                </td>
                <td>
                  <span>Browsing history, search history, online behavior , interest data, and interactions with our and other websites, applications, systems, and advertisements </span>
                </td>
                <td>
                  <span> YES </span>
                </td>
              </tr>
              <tr>
                <td>
                  <span> G . Geolocation data </span>
                </td>
                <td>
                  <span>Device location</span>
                </td>
                <td>
                  <span> YES </span>
                </td>
              </tr>
              <tr>
                <td>
                  <span> H . Audio, electronic, sensory, or similar information </span>
                </td>
                <td>
                  <span>Images and audio, video or call recordings created in connection with our business activities</span>
                </td>
                <td>
                  <span> NO </span>
                </td>
              </tr>
              <tr>
                <td>
                  <span> I . Professional or employment-related information </span>
                </td>
                <td>
                  <span>Business contact details in order to provide you our Services at a business level or job title, work history, and professional qualifications if you apply for a job with us</span>
                </td>
                <td>
                  <span> NO </span>
                </td>
              </tr>
              <tr>
                <td>
                  <span> J . Education Information </span>
                </td>
                <td>
                  <span>Student records and directory information</span>
                </td>
                <td>
                  <span> NO </span>
                </td>
              </tr>
              <tr>
                <td>
                  <span> K . Inferences drawn from collected personal information </span>
                </td>
                <td>
                  <span>Inferences drawn from any of the collected personal information listed above to create a profile or summary about, for example, an individual’s preferences and characteristics</span>
                </td>
                <td>
                  <span> NO </span>
                </td>
              </tr>
              <tr>
                <td>
                  <span> L . Sensitive personal Information </span>
                </td>
                <td>
                  <span> NO</span>
                </td>
              </tr>
            </tbody>
          </table>
          <span>We may also collect other personal information outside of these categories through instances where you interact with us in person, online, or by phone or mail in the context of:</span>
          <ul>
            <li>
              <span>Receiving help through our customer support channels; </span>
            </li>
          </ul>
          <ul>
            <li>
              <span>Participation in customer surveys or contests; and </span>
            </li>
          </ul>
          <ul>
            <li>
              <span>Facilitation in the delivery of our Services and to respond to your inquiries.</span>
            </li>
          </ul>
          <span>We will use and retain the collected personal information as needed to provide the Services or for: </span>
          <ul>
            <li>
              <span>Category A - As long as the user has an account with us </span>
            </li>
          </ul>
          <ul>
            <li>
              <span>Category D - As long as the user has an account with us </span>
            </li>
          </ul>
          <ul>
            <li>
              <span>Category F - As long as the user has an account with us </span>
            </li>
          </ul>
          <ul>
            <li>
              <span>Category G - As long as the user has an account with us </span>
            </li>
          </ul>
          <div>
            <strong>
              <h3>Sources of Personal Information </h3>
            </strong><span>Learn more about the sources of personal information we collect in " </span><span><span><a href="#infocollect"><span>WHAT INFORMATION DO WE COLLECT?</span></a></span></span><span> " </span>
            <span><span><strong>
              <h3>How We Use and Share Personal Information </h3>
            </strong></span></span><span> Learn more about how we use your personal information in the section, " </span><a href="#infouse"><span>HOW DO WE PROCESS YOUR INFORMATION?</span></a><span> " </span>
          </div>
          <strong>Will your information be shared with anyone else?</strong>
          <div>
            <span>We may disclose your personal information with our service providers pursuant to a written contract between us and each service provider. Learn more about how we disclose personal information to in the section, " </span><a href="#whoshare"><span>WHEN AND WITH WHOM DO WE SHARE YOUR PERSONAL INFORMATION?</span></a><span> " </span>
          </div>
          <span>We may use your personal information for our own business purposes, such as for undertaking internal research for technological development and demonstration. This is not considered to be "selling" of your personal information. </span>
          <span>We have not disclosed, sold, or shared any personal information to third parties for a business or commercial purpose in the preceding twelve (12) months. We will not sell or share personal information in the future belonging to website visitors, users, and other consumers.</span>
          <div>
            <span><strong>
              <h3>Your Rights </h3>
            </strong><span>You have rights under certain US state data protection laws. However, these rights are not absolute, and in certain cases, we may decline your request as permitted by law. These rights include:</span>
            </span>
          </div>
          <ul>
            <li>
              <span><strong>Right to know</strong> whether or not we are processing your personal data </span>
            </li>
          </ul>
          <ul>
            <li>
              <span><strong>Right to access </strong>your personal data </span>
            </li>
          </ul>
          <ul>
            <li>
              <span><strong>Right to correct </strong>inaccuracies in your personal data </span>
            </li>
          </ul>
          <ul>
            <li>
              <span><strong>Right to request</strong> the deletion of your personal data </span>
            </li>
          </ul>
          <ul>
            <li>
              <span><strong>Right to obtain a copy </strong>of the personal data you previously shared with us </span>
            </li>
          </ul>
          <ul>
            <li>
              <span><strong>Right to non-discrimination</strong> for exercising your rights </span>
            </li>
          </ul>
          <ul>
            <li>
              <span><strong>Right to opt out</strong> of the processing of your personal data if it is used for targeted advertising (or sharing as defined under California’s privacy law) , the sale of personal data, or profiling in furtherance of decisions that produce legal or similarly significant effects ( "profiling" ) </span>
            </li>
          </ul>
          <span>Depending upon the state where you live, you may also have the following rights:</span>
          <ul>
            <li>
              <span>Right to obtain a list of the categories of third parties to which we have disclosed personal data (as permitted by applicable law, including the privacy law in California and Delaware ) </span>
            </li>
          </ul>
          <ul>
            <li>
              <span>Right to limit use and disclosure of sensitive personal data (as permitted by applicable law, including the privacy law in California)</span>
            </li>
          </ul>
          <div>
            <strong>
              <h3>How to Exercise Your Rights </h3>
            </strong><span>To exercise these rights, you can contact us by visiting <a href="https://laminar.sh" target="_blank">https://laminar.sh</a> , </span><span> by emailing us at founders@lmnr.ai , </span><span>or by referring to the contact details at the bottom of this document.</span>
          </div>
          <div>
            <span><span>Under certain US state data protection laws, you can designate an authorized agent to make a request on your behalf. We may deny a request from an authorized agent that does not submit proof that they have been validly authorized to act on your behalf in accordance with applicable laws. </span><br /><strong>
              <h3>Request Verification </h3>
            </strong><span>Upon receiving your request, we will need to verify your identity to determine you are the same person about whom we have the information in our system. We will only use personal information provided in your request to verify your identity or authority to make the request. However, if we cannot verify your identity from the information already maintained by us, we may request that you provide additional information for the purposes of verifying your identity and for security or fraud-prevention purposes.</span></span>
          </div>
          <div>
            <span>If you submit the request through an authorized agent, we may need to collect additional information to verify your identity before processing your request and the agent will need to provide a written and signed permission from you to submit such request on your behalf. </span>
            <span><span><strong>
              <h3>Appeals </h3>
            </strong></span><span>Under certain US state data protection laws, if we decline to take action regarding your request, you may appeal our decision by emailing us at founders@lmnr.ai . We will inform you in writing of any action taken or not taken in response to the appeal, including a written explanation of the reasons for the decisions. If your appeal is denied, you may submit a complaint to your state attorney general. </span>
            </span>
            <span><strong>
              <h3>California "Shine The Light" Law </h3>
            </strong><span>California Civil Code Section 1798.83, also known as the "Shine The Light" law, permits our users who are California residents to request and obtain from us, once a year and free of charge, information about categories of personal information (if any) we disclosed to third parties for direct marketing purposes and the names and addresses of all third parties with which we shared personal information in the immediately preceding calendar year. If you are a California resident and would like to make such a request, please submit your request in writing to us by using the contact details provided in the section " </span></span><span><a href="#contact"><span>HOW CAN YOU CONTACT US ABOUT THIS NOTICE?</span></a></span><span> " </span>
          </div>
          <div id="policyupdates">
            <span><strong>
              <h2>14. DO WE MAKE UPDATES TO THIS NOTICE? </h2>
            </strong></span><span><strong><em>In Short: </em></strong><em>Yes, we will update this notice as necessary to stay compliant with relevant laws.</em></span>
          </div>
          <span>We may update this Privacy Notice from time to time. The updated version will be indicated by an updated "Revised" date at the top of this Privacy Notice. If we make material changes to this Privacy Notice, we may notify you either by prominently posting a notice of such changes or by directly sending you a notification. We encourage you to review this Privacy Notice frequently to be informed of how we are protecting your information. </span>
          <div id="contact">
            <span><strong>
              <h2>15. HOW CAN YOU CONTACT US ABOUT THIS NOTICE? </h2>
            </strong></span><span>If you have questions or comments about this notice, you may contact our Data Protection Officer (DPO)<span> by email at </span><span> robert@lmnr.ai </span>, </span>
            <span> or </span><span>contact us by post at:</span>
          </div>
          <span> LMNR AI, Inc. </span>
          <span>Data Protection Officer</span>
          <span> 2261 Market Street </span>
          <span> STE 10826 </span>
          <div>
            <span> San Francisco <span><span> , CA </span> 94114 </span>
            </span>
          </div>
          <span> United States </span>
          <div id="request">
            <span><strong>
              <h2>16. HOW CAN YOU REVIEW, UPDATE, OR DELETE THE DATA WE COLLECT FROM YOU? </h2>
            </strong></span><span> Based on the applicable laws of your country or state of residence in the US , you may have the right to request access to the personal information we collect from you, details about how we have processed it, correct inaccuracies, or delete your personal information. You may also have the right to withdraw your consent to our processing of your personal information. These rights may be limited in some circumstances by applicable law. To request to review, update, or delete your personal information, please </span>
            <span>contact us at: <a href="mailto:founders@lmnr.ai" target="_blank">founders@lmnr.ai</a>
            </span><span>.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
