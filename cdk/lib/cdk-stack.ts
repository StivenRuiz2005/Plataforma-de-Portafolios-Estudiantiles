import * as cdk from "aws-cdk-lib/core";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as path from "path";
import * as iam from "aws-cdk-lib/aws-iam";
import * as cr from "aws-cdk-lib/custom-resources";
import * as fs from "fs";

export class CdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const publicKey = new cloudfront.PublicKey(this, "SigningPublicKey", {
      encodedKey: fs.readFileSync(
        path.join(__dirname, "../keys/public_key.pem"),
        "utf8",
      ),
    });
    const keyGroup = new cloudfront.KeyGroup(this, "SigningKeyGroup", {
      items: [publicKey],
    });

    const bucket = new s3.Bucket(this, "PortfolioBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const table = new dynamodb.Table(this, "PortfolioTable", {
      partitionKey: { name: "studentId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const s3Origin = origins.S3BucketOrigin.withOriginAccessControl(bucket);

    const distribution = new cloudfront.Distribution(this, "PortfolioCdn", {
      defaultBehavior: {
        origin: s3Origin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      additionalBehaviors: {
        "private/*": {
          origin: s3Origin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          trustedKeyGroups: [keyGroup],
        },
      },
      defaultRootObject: "index.html",
      priceClass: cloudfront.PriceClass.PRICE_CLASS_200,
    });

    new cr.AwsCustomResource(this, "SeedPortfolioItem", {
      onCreate: {
        service: "DynamoDB",
        action: "putItem",
        parameters: {
          TableName: table.tableName,
          Item: {
            studentId: { S: "univalle-2026-001" },
            studentName: { S: "Ana Estudiante" },
            program: { S: "Ingeniería de Sistemas" },
            publishedAt: { S: "2026-09-19T10:00:00Z" },
            url: {
              S: `https://${distribution.distributionDomainName}/index.html`,
            },
            visibility: { S: "public" },
          },
        },
        physicalResourceId: cr.PhysicalResourceId.of("seed-univalle-2026-001"),
      },
      policy: cr.AwsCustomResourcePolicy.fromSdkCalls({
        resources: [table.tableArn],
      }),
    });

    new s3deploy.BucketDeployment(this, "DeployPortfolio", {
      sources: [
        s3deploy.Source.asset(path.join(__dirname, "../../application")),
      ],
      destinationBucket: bucket,
      distribution,
      distributionPaths: ["/*"],
    });

    new cdk.CfnOutput(this, "CloudFrontURL", {
      value: `https://${distribution.distributionDomainName}`,
    });
    new cdk.CfnOutput(this, "BucketName", { value: bucket.bucketName });
    new cdk.CfnOutput(this, "TableName", { value: table.tableName });

    //Roles

    const uploaderRole = new iam.Role(this, "PortfolioUploaderRole", {
      assumedBy: new iam.AccountRootPrincipal(),
      description: "Puede subir archivos de portafolio al Bucket S3",
    });
    bucket.grantPut(uploaderRole);

    const readerRole = new iam.Role(this, "MetadataReaderRole", {
      assumedBy: new iam.AccountRootPrincipal(),
      description: "Solo lectura de metadatos en DynamoDB",
    });
    table.grantReadData(readerRole);

    new cdk.CfnOutput(this, "UploaderRoleArn", { value: uploaderRole.roleArn });
    new cdk.CfnOutput(this, "ReaderRoleArn", { value: readerRole.roleArn });
    new cdk.CfnOutput(this, "PublicKeyId", { value: publicKey.publicKeyId });
  }
}
