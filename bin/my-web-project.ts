#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { MyWebProjectStack } from '../lib/my-web-project-stack';

const app = new cdk.App();
new MyWebProjectStack(app, 'MyWebProjectStack');
