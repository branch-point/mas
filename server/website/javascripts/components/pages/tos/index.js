import React from 'react';
import classNames from 'classnames/bind';
import styles from './index.css';

const cx = classNames.bind(styles);

const TOSPage = () => (
    <main className={cx('main')}>
        <h1 className={cx('headline')}>
            Terms and conditions
        </h1>
        <div className={cx('content')}>
            <p>
                The user may access MeetAndSpeak services by registering a user
                account or by visiting MeetAndSpeak groups as a non-registered visitor. In both cases,
                you agree to comply with and be bound by the following terms and conditions of
                service, which alongside our privacy policy govern MeetAndSpeak's relationship
                with you.
            </p>
            <p>
                In these terms, 'MeetAndSpeak', 'us', or 'we' refers to the owner of this Web site, MeetAndSpeak Ltd., whose
                registered office is in Finland, while 'you' refers to the user or viewer of our
                service.
            </p>
            <p>
                Use of MeetAndSpeak services (or 'the service') is subject to the following terms of use:
            </p>
            <p>
                You acknowledge that all information, data, text, and other material made available via the service ('content'),
                whether publicly posted or transmitted to a closed group through / in relation to the service (e.g., to the
                service provider or a MeetAndSpeak group), are solely the responsibility of the (legal or natural) person with
                whom said content originated and shall remain so. You understand accordingly that you, not MeetAndSpeak, bear
                full responsibility for all content that you make available - whether in the form of a post, upload, or other
                transmission - via the service. The same is true for all users of the service: MeetAndSpeak does not exercise
                control of content posted via the service and, therefore, cannot make any guarantees concerning the accuracy,
                integrity, or quality of content originating from any user of the service.
            </p>
            <p>
                You recognise that your use of the
                service may expose you to material that you could find indecent, consider offensive, or deem otherwise objectionable
                and that under no circumstances will MeetAndSpeak be held liable for any aspect of content presented by means
                of the service. This includes, but is not limited to, liability for any loss or damage of any kind (direct or
                indirect/consequential) incurred as a result of errors, omission, or malicious intent in any content posted,
                transmitted, or otherwise made available via the service. Copyright to the content remains with the person/entity
                originating it.
            </p>
            <b>
                Recognising your responsibility for the content you generate, you agree to not use the service in any of the following connections:
            </b>
            <ul>
                <li>
                    To upload, post, or otherwise transmit (as via e-mail) or make available any content that is
                    unlawful, potentially harmful, threatening, abusive, harassing, defamatory,
                    invasive of another's privacy, or otherwise objectionable. Examples of such activity are 'calling people names', hunting out and
                    posting other posters' private contact details, and providing 'help' in the form of a command that would delete the help-seeker's operating system.
                </li>

                <li>
                    To harm or threaten harm, of any sort whatsoever, to other MeetAndSpeak users in any way
                </li>

                <li>
                    To misrepresent yourself, including impersonation of any individual, business, or other entity, including MeetAndSpeak
                </li>

                <li>
                    To interfere with the use of MeetAndSpeak by others - this includes disrupting the normal flow of dialogue, causing
                    a screen view to scroll past more rapidly than other users of the service are able to read or type, flooding the service,
                    and otherwise acting in a manner that negatively affects other users' ability to engage in meaningful real-time
                    exchanges
                </li>

                <li>
                    Intentionally or unintentionally, to violate any applicable local, state/regional, national, or
                    international law, or incite or otherwise encourage conduct that would constitute a criminal offence or give rise to
                    civil liability. 'Local' in this context means Finland and the user's home state/country.
                </li>

                <li>
                    To victimise, harass, degrade, or intimidate an individual, category of persons, or group on the basis of religious
                    affiliation, gender, sexual orientation, race/ethnicity, age, or disability
                </li>
            </ul>
            <h1>
                Privacy policy
            </h1>
            <p>
                MeetAndSpeak user data:
            </p>
            <p>
                MeetAndSpeak does not share its user database with any third parties. A detailed <a href="/register_description.html">register description</a> is available.
            </p>
            <p>
                User-generated content:
            </p>
            <p>
                Activation of logging requires opt-in by the user. Log files will be kept in a
                secure environment, and under no circumstances will they be accessed by MeetAndSpeak personnel. All users can independently enable or disable logging; the choice is not visible to other users.
            </p>
            <p>
                Information about groups or IRC channels that the user has visited previously is not
                stored by MeetAndSpeak if the user had logging disabled logging at that time. Users are free to keep records of whatever information they have seen via the service, and to publicise and otherwise use that information.
            </p>
            <h1>
                Liability and other legal notices
            </h1>
            <p>
                In no event shall MeetAndSpeak Ltd. or MeetAndSpeak staff, jointly or individually, be held liable for any loss or damage whatsoever - including, without limitation, indirect or consequential
                loss or damage - arising from loss of data or profits caused by, or in connection with, the use of this service.
            </p>
            <p>
                Every effort is made to keep the Web site up and running smoothly. However,
                MeetAndSpeak Ltd. takes no responsibility for, and will not be liable for, the Web site
                being temporarily unavailable as a result of technical issues beyond our control.
            </p>
            <p>
                MeetAndSpeak Ltd. reserves rights to change the service with or without notice.
            </p>
        </div>
    </main>
);

export default TOSPage;
