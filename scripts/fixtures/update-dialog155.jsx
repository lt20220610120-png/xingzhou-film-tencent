import React from 'react';
import {createRoot} from 'react-dom/client';
import {SoftwareUpdatePrompt} from '../../src/v06/SoftwareUpdatePrompt.jsx';
import '../../src/styles.css';
import '../../src/account-access.css';
import '../../src/access-experience.css';

createRoot(document.getElementById('root')).render(<SoftwareUpdatePrompt/>);
