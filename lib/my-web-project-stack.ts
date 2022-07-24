import * as path from 'path';
import { Construct } from 'constructs';
import { Stack, StackProps, RemovalPolicy,aws_codepipeline_actions,Duration } from 'aws-cdk-lib';
import * as codecommit from 'aws-cdk-lib/aws-codecommit';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import { LinuxBuildImage } from 'aws-cdk-lib/aws-codebuild';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline'
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins'
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment'
import * as yaml from 'yaml';
import * as fs from 'fs'
export class MyWebProjectStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const repo = new codecommit.Repository(this, "codecommitStack01", {
      repositoryName: "my-web-repo-test",
      description: "this is my first web",
      //In case you have your reactjs file within this project
      // code: codecommit.Code.fromZipFile(path.join(__dirname, "/source/Archive.zip"), "main")
    });

    //Using reactjs file from s3
    const cfnRepo = repo.node.defaultChild as codecommit.CfnRepository;
    cfnRepo.addPropertyOverride('Code', {
      S3: {
        Bucket: 'my-stuffs',
        Key: 'codeCDK/web/Archive.zip',
      },
      BranchName: "main",
    });
    cfnRepo.addPropertyOverride('Tags', [{
      "Key" : "project",
      "Value" : "my-web"
    }]);
    repo.applyRemovalPolicy(RemovalPolicy.RETAIN)

    let bucket = new s3.Bucket(this, "s3Stack01", {
      bucketName: "my-web-test-1",
    })
    bucket.applyRemovalPolicy(RemovalPolicy.RETAIN)

    let myWebCache = new cloudfront.CachePolicy(this,'createCachePolicy',{
      cachePolicyName: 'myWebPolicy',
      comment: 'My policy',
      defaultTtl: Duration.days(2),
      minTtl: Duration.minutes(1),
      maxTtl: Duration.days(10),
    })
    const originAccessIdentity = new cloudfront.OriginAccessIdentity(this, 'MyOriginAccessIdentity', /* all optional props */ {
      comment: 'this is a test',
      
    });
    let distribution = new cloudfront.Distribution(this,'createDistribution', {
      defaultBehavior: { 
        origin: new origins.S3Origin(bucket,{
          originAccessIdentity : originAccessIdentity,
        }),
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
        originRequestPolicy: cloudfront.OriginRequestPolicy.CORS_S3_ORIGIN,
        cachePolicy: myWebCache,
        },
        defaultRootObject: 'index.html',
    }
    )
    distribution.applyRemovalPolicy(RemovalPolicy.RETAIN)

    let roleName = "codebuildRole"
    const codebuildRole = new iam.Role(this, 'createRoleStack01', {
      roleName: roleName,
      assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
      description: 'role for building cool stuffs',
      inlinePolicies: {
        ['allowBuildStuffs'] : new iam.PolicyDocument({
          statements: [new iam.PolicyStatement({
            actions: [
              "cloudwatch:*",
              "cloudformation:*",
              "logs:*",
              "s3:*",
              "ssm:*",
              "iam:*",
              "kms:*"
            ],
            sid: "allowServices",
            resources: ['*'],
          })]
        })
      }
    });
    codebuildRole.applyRemovalPolicy(RemovalPolicy.RETAIN)

    const importedRole = iam.Role.fromRoleName(
      this,
      "importRoleStack01",
      roleName,
      {mutable: false},
    );

    const stringified: string = fs.readFileSync(path.join(__dirname, "/buildspec.yaml"), { encoding: 'utf-8', });
    const parsed: any = yaml.parse(stringified);

    let projectName = "web-build"
    let project = new codebuild.Project(this, "createCodeBuildStack01",{
      projectName: projectName,
      buildSpec: codebuild.BuildSpec.fromObjectToYaml(parsed),
      role: importedRole,
      environment: {
        buildImage: LinuxBuildImage.STANDARD_5_0,
        computeType: codebuild.ComputeType.SMALL
      },
      source: codebuild.Source.codeCommit({
        repository : repo,
        branchOrRef : "main"
      })
    })

    project.applyRemovalPolicy(RemovalPolicy.RETAIN)

    const repoOutput = new codepipeline.Artifact();
    const pipeline = new codepipeline.Pipeline(this, "createPipelines01",{
      pipelineName: "my-web-pipelines",
      stages: [{
        stageName: "Commit",
        actions: [new aws_codepipeline_actions.CodeCommitSourceAction({
          actionName: "commitMe",
          repository: repo,
          output: repoOutput,
          branch: "main"
        })]
      },{
        stageName: "Build",
        actions: [new aws_codepipeline_actions.CodeBuildAction({
          actionName: "BuildMe",
          input: repoOutput,
          project: project,
          environmentVariables: {
            S3BUCKET: {
              value: `s3://my-web-test-1`
            }
          }
        })],
      }]
    }); 
    const cfnPipelines = pipeline.node.defaultChild as codepipeline.CfnPipeline;
    cfnPipelines.addPropertyOverride('Tags', 
      [{
        "Key" : "project",
        "Value" : "my-web"
      }]
    );
  
    pipeline.applyRemovalPolicy(RemovalPolicy.RETAIN)

  }
}
